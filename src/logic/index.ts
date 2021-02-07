
import { Connection, MoreThan } from 'typeorm'
import ArtistEntity from '../entity/Artist'
import AlbumEntity from '../entity/Album'
import TrackEntity from '../entity/Track'
import { getUserAllPlaylistsTracks, getArtistsFromTracks, getArtistAlbums, getAlbumTracks, playTrack } from '../spotify/utils'
import Artist from '../entity/Artist'

export const doStuff = async ( auth, Database: Connection ) => {
    const ArtistRepository = Database.getRepository( ArtistEntity )
    const AlbumRepository = Database.getRepository( AlbumEntity )
    const TrackRepository = Database.getRepository( TrackEntity )

    // Feature 1) Queue next song.
    //              - Plays a song that hasn't been rated yet.
    // Feature 2) Rate a song.
    //              - Show for songs that were recently played
    //              - Rating options: "NOPE", "not quite", "YES" (float rating between 7-10).
    // 
    // Feature 3) Export rated songs into playlist.
    //
    // Feature 4) Scraping songs that you might know
    // Feature 5) Targeting configuration (enabling users to slowly creep over the music they know)
    //              - Exclude/Include Artists

    // TODO: Since targeting configuration requirements are still unclear,
    // Don't work on UI yet - just make backend that
    //  a) approximates amount of targeted songs
    //  b) Has Exclude/Include artists functionality.
    //  c) Can play you a song.
    //  d) You can rate recently played songs.

    const artists = await ArtistRepository.find()
    console.log(`${artists.length} artists`)

    const albums = await AlbumRepository.find()
    console.log(`${albums.length} albums`)

    const tracks = await TrackRepository.find()
    console.log(`${tracks.length} tracks`)

    const {
        approxTracksCount,
        approxTracksDurationMs
    } = await approximateTargetTracksStats( auth, Database )
    console.log(`Approx target tracks count: ${approxTracksCount} (${parseDurationMs(approxTracksDurationMs)})`)

    await playUnratedTrack(auth, Database)

}

// #region ----- Main functions -----

/**
 * Approximates targeted track count without initiating Tracks scraping (HEAVY).
 * 
 * + some other statistics, like total duration.
 */
export const approximateTargetTracksStats = async ( auth, Database: Connection ) => {
    // Ensure albums up to date.
    const albums = await updateAlbums(auth, Database)

    let approxTracksCount = 0
    let approxTracksDurationMs = 0
    // Iterate through every album in database.
    for (const album of albums) {
        if (album.tracksListed) {
            // Album tracks have been scraped, so we know the exact amount of tracks it has.
            approxTracksCount += album.tracksCount
        } else {
            // Album tracks have NOT been scraped, just go with some rough average assumption.
            const assumedTracksCount = 10
            const assumedTrackDurationMsAvg = 3 * 60 * 1000
            approxTracksCount += assumedTracksCount
            approxTracksDurationMs += assumedTracksCount * assumedTrackDurationMsAvg
        }
    }
    return {
        approxTracksCount,
        approxTracksDurationMs
    }
}

export const getRandomUnratedTracks = async (auth, Database: Connection, count: number): Promise<TrackEntity[]> => {
    const AlbumRepository = Database.getRepository( AlbumEntity )

    // Assume albums up to date.
    
    // Get eligible albums (after targeting configuration).
    const eligibleAlbums = await AlbumRepository.find({
        where: {
            allTracksRated: false
        }
    })

    const randomUnratedTracks: TrackEntity[] = []
    do {
        try {
            const randomAlbum = eligibleAlbums[Math.round(Math.random() * (eligibleAlbums.length - 1))]
            let albumTracks: TrackEntity[]
            if (! randomAlbum.tracksListed) {
                // Scrape album tracks.
                const artist = (await AlbumRepository.findOne(randomAlbum.id, {relations: ['artist']})).artist
                albumTracks = await scrapeAlbumTracks(auth, Database, randomAlbum, artist)
            } else {
                // Load album tracks from DB.
                albumTracks = (await AlbumRepository.findOne(randomAlbum.id, {relations: ['tracks']})).tracks
            }

            // Select random track.
            const randomTrack = albumTracks[Math.round(Math.random() * (albumTracks.length - 1))]
            if (!randomTrack) {
                throw new Error(`'randomTrack' was undefined (album.id: ${randomAlbum.id}, albumTracks.length: ${albumTracks.length})`)
            }
            randomUnratedTracks.push(randomTrack)

        } catch (e) {
            console.error(`Unhandled error while picking random track ${e.message}`)
            break
        }
    } while (randomUnratedTracks.length < count)

    return randomUnratedTracks
}

/**
 * Starts playing any unrated track.
 */
export const playUnratedTrack = async (auth, Database: Connection) => {
    const TrackRepository = Database.getRepository(TrackEntity)

    const track = (await getRandomUnratedTracks(auth, Database, 1))[0]
    if (! track) return
    console.log(`Playing ${track.name} by ${track.artist.name}`)

    await playTrack(auth, track.uri)
    // Mark track played.
    track.playedTimestamp = Date.now()
    await TrackRepository.save(track)
}

export const getRecentlyPlayedTracks = async (auth, Database: Connection): Promise<TrackEntity[]> => {
    const TrackRepository = Database.getRepository(TrackEntity)
    return TrackRepository.find({
        where: {
            playedTimestamp: MoreThan( Date.now() - 30 * minuteMs )
        }
    })
}

const secondMs = 1000
const minuteMs = 60 * secondMs
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs
const weekMs = 7 * dayMs
const monthMs = 30 * dayMs
const yearMs = 12 * monthMs
const parseDurationMs = (durationMs: number): string => {
    if (durationMs > 2 * yearMs) return `${(durationMs / yearMs).toFixed(1)} years :D`
    if (durationMs > 2 * monthMs) return `${(durationMs / monthMs).toFixed(1)} months :D`
    if (durationMs > 2 * weekMs) return `${(durationMs / weekMs).toFixed(1)} weeks :3`
    if (durationMs > 3 * dayMs) return `${(durationMs / dayMs).toFixed(1)} days :]`
    if (durationMs > 2 * hourMs) return `${(durationMs / hourMs).toFixed(1)} hours :)`
    return `${(durationMs / minuteMs).toFixed(1)} minutes !`
}

/**
 * Update albums in database by going through all listed Artists and ensuring all their albums exist in database.
 *
 * (Doesn't check for new albums by artists, only for newly listed Artists that haven't been scraped before).
 */
const updateAlbums = async (auth, Database: Connection) => {
    const ArtistRepository = Database.getRepository( ArtistEntity )
    const AlbumRepository = Database.getRepository( AlbumEntity )

    console.log(`\tUpdating albums ...`)
    const albumsCountBefore = (await AlbumRepository.find()).length
    const artists = await ArtistRepository.find()
    for (const artist of artists) {
        // artist.albumsListed = false
        if (! artist.albumsListed ) {
            console.log(`\t\tListing artist albums (${artist.name}) ...`)
            await scrapeArtistAlbums(auth, Database, artist)
        }
    }

    // Return up to date albums.
    const albums = await AlbumRepository.find()
    console.log(`\tAlbums update complete (${albums.length - albumsCountBefore} new albums)`)
    return albums
}

// #endregion

// #region ----- Scraping functions (get data from Spotify and add it to Database) -----

/**
 * Function scrapes all Artists from users all playlists.
 *
 * TODO: Also include individually followed artists.
 */
export const scrapeUserArtists = async ( auth, Database: Connection ) => {
    const ArtistRepository = Database.getRepository( ArtistEntity )
    
    const { tracks, playlists } = await getUserAllPlaylistsTracks(auth)
    const artists = await getArtistsFromTracks(auth, tracks)
    const artistEntities: ArtistEntity[] = []
    for (const artist of artists) {
        try {
            let artistEntity = new ArtistEntity()
            artistEntity.id = artist.id
            artistEntity.name = artist.name
            artistEntity.href = artist.href
            artistEntity.uri = artist.uri

            artistEntity = await ArtistRepository.save(artistEntity)
            artistEntities.push(artistEntity)
        } catch (e) {
            console.error(`failed to save artist ` + e.message + ' ' + JSON.stringify(artist) )
        }
    }
    return artistEntities
}

/**
 * Function scrapes all Albums from given artist.
 */
export const scrapeArtistAlbums = async ( auth, Database: Connection, artist: ArtistEntity ) => {
    const AlbumRepository = Database.getRepository( AlbumEntity )
    const ArtistRepository = Database.getRepository( ArtistEntity )

    const albums = await getArtistAlbums(auth, artist)
    const albumEntities: AlbumEntity[] = []
    for (const album of albums) {
        try {
            let albumEntity = new AlbumEntity()
            albumEntity.id = album.id
            albumEntity.name = album.name
            albumEntity.href = album.href
            albumEntity.uri = album.uri
            albumEntity.artist = artist

            albumEntity = await AlbumRepository.save(albumEntity)
            albumEntities.push(albumEntity)
        } catch (e) {
            console.error(`failed to save album ` + e.message + ' ' + JSON.stringify(album) )
        }
    }

    // Mark artist albums as listed.
    artist.albumsListed = true
    artist.albums = albumEntities
    await ArtistRepository.save(artist)

    return albumEntities
}

/**
 * Function scrapes Tracks from a single Album.
 */
export const scrapeAlbumTracks = async ( auth, Database: Connection, album: AlbumEntity, artist: ArtistEntity ) => {
    const AlbumRepository = Database.getRepository( AlbumEntity )
    const TrackRepository = Database.getRepository( TrackEntity )

    const tracks = await getAlbumTracks(auth, album)
    const trackEntities: TrackEntity[] = []
    for (const track of tracks) {
        try {
            let trackEntity = new TrackEntity()
            trackEntity.id = track.id
            trackEntity.name = track.name
            trackEntity.href = track.href
            trackEntity.uri = track.uri
            trackEntity.duration_ms = Number(track.duration_ms)
            trackEntity.album = album
            trackEntity.artist = artist

            trackEntity = await TrackRepository.save(trackEntity)
            trackEntities.push(trackEntity)
        } catch (e) {
            console.error(`failed to save track ` + e.message + ' ' + JSON.stringify(album) )
        }
    }

    // Mark album tracks as listed and cache tracks count.
    album.tracks = trackEntities
    album.tracksListed = true
    album.tracksCount = tracks.length
    album.tracksDurationMs = trackEntities.reduce((sum, cur) => sum + cur.duration_ms, 0)
    await AlbumRepository.save(album)

    return trackEntities
}

// #endregion
