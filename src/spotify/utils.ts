// Get all artists of user.

import * as request from 'request-promise-native'

export const getUserAllPlaylistsTracks = async (auth) => {
    console.log(`\tFinding all playlists ...`)
    const playlists = await getUserAllPlaylists(auth)
    console.log(`\t\tFound ${playlists.length} playlists`)
    const allTracks: SpotifyTrack[] = []
    console.log(`\tFinding all tracks ...`)
    for (let i = 0; i < playlists.length; i ++) {
        const playlist = playlists[i]
        console.log(`\t\tIterating over playlist #${i+1}/${playlists.length} (${playlist.name}) ...`)
        const tracks = await getUserPlaylistTracks(auth, playlist)
        console.log(`\t\t\tPlaylist has ${tracks.length} tracks`)
        // Remove duplicate Tracks.
        let addedTracks = 0
        for (const track of tracks) {
            if (undefined === allTracks.find((duplicate) => duplicate.id === track.id)) {
                allTracks.push(track)
                addedTracks ++
            }
        }
        console.log(`\t\t\tAdded ${addedTracks} tracks (removed duplicates)`)
    }
    console.log(`\tFound total of ${allTracks.length} from ${playlists.length} playlists`)
    return {
        tracks: allTracks,
        playlists
    }
}
const getUserAllPlaylists = async ( auth ) => {
    const { access_token } = auth
    
    const allPlaylists: SpotifyPlaylist[] = []
    let moreAvailable = true
    let uri = 'https://api.spotify.com/v1/me/playlists'
    do {
        const response = JSON.parse(
            await request({
                method: 'GET',
                uri,
                headers: {
                    Authorization: `Bearer ${ access_token }`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            })
        )
        const playlists = response.items
        allPlaylists.push.apply(allPlaylists, playlists)

        if (response.next) {
            moreAvailable = true
            uri = response.next
        } else {
            moreAvailable = false
        }
    } while (moreAvailable)

    return allPlaylists
}
const getUserPlaylistTracks = async ( auth, playlist ) => {
    const { access_token } = auth
    
    const allTracks: SpotifyTrack[] = []
    let moreAvailable = true
    let uri = `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`
    do {
        const response = JSON.parse(
            await request({
                method: 'GET',
                uri,
                headers: {
                    Authorization: `Bearer ${ access_token }`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            })
        )
        const tracks = response.items.map(item => item.track)
        allTracks.push.apply(allTracks, tracks)

        if (response.next) {
            moreAvailable = true
            uri = response.next
        } else {
            moreAvailable = false
        }
    } while (moreAvailable)

    return allTracks
}
export const getArtistsFromTracks = async ( auth, tracks: SpotifyTrack[] ) => {
    const artists: SpotifyArtist[] = []
    console.log(`\tFinding artists from ${tracks.length} tracks ...`)
    for (let i = 0; i < tracks.length; i ++) {
        const track = tracks[i]
        const artist = track.artists[0]
        if (!artist) {
            throw new Error(`Track has no artist ??? ${track.name} ${track.artists}`)
        }
        if (undefined === artists.find((duplicate) => duplicate.id === artist.id)) {
            artists.push(artist)
        }
    }
    console.log(`\tFound ${artists.length} artists`)
    return artists
}
export const getArtistAlbums = async (auth, artist: SpotifyArtist) => {
    const { access_token } = auth

    const allAlbums: SpotifyAlbum[] = []
    // #region Find albums
    console.log(`\tFinding albums by artist ...`)
    let moreAvailable = true
    let uri = `https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=album`
    do {
        const response = JSON.parse(
            await request({
                method: 'GET',
                uri,
                headers: {
                    Authorization: `Bearer ${ access_token }`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            })
        )
        let albums = response.items
        // Remove albums with same name.
        for (const album of albums) {
            if (undefined === allAlbums.find(duplicate => duplicate.name === album.name)) {
                allAlbums.push(album)
            }
        }

        if (response.next) {
            moreAvailable = true
            uri = response.next
        } else {
            moreAvailable = false
        }
    } while (moreAvailable)

    console.log(`\tFound ${allAlbums.length} albums`)
    return allAlbums
}
export const getAlbumTracks = async (auth, album: SpotifyAlbum) => {
    const { access_token } = auth

    console.log(`\tFinding tracks from album ...`)
    const allTracks: SpotifyTrack[] = []
    let moreAvailable = true
    let uri = `https://api.spotify.com/v1/albums/${album.id}/tracks`
    do {
        const response = JSON.parse(
            await request({
                method: 'GET',
                uri,
                headers: {
                    Authorization: `Bearer ${ access_token }`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            })
        )
        const tracks = response.items
        allTracks.push.apply(allTracks, tracks)

        if (response.next) {
            moreAvailable = true
            uri = response.next
        } else {
            moreAvailable = false
        }
    } while (moreAvailable)
    console.log(`\tFound total of ${allTracks.length} tracks`)

    return allTracks
}
const getArtistTracks = async (auth, artist: SpotifyArtist) => {
    const { access_token } = auth

    const allAlbums: SpotifyAlbum[] = await getArtistAlbums(auth, artist)
    const allTracks: SpotifyTrack[] = []
    // #region Find tracks
    console.log(`\tFinding tracks from albums ...`)
    for (let i = 0; i < allAlbums.length; i ++) {
        const album = allAlbums[i]
        console.log(`\t\tAlbum ${i+1}/${allAlbums.length} (${album.name})`)
        let moreAvailable = true
        let addedTracks = 0
        let uri = `https://api.spotify.com/v1/albums/${album.id}/tracks`
        do {
            const response = JSON.parse(
                await request({
                    method: 'GET',
                    uri,
                    headers: {
                        Authorization: `Bearer ${ access_token }`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                })
            )
            const tracks = response.items
            console.log(`\t\t\tFound ${tracks.length} tracks`)
            for (const track of tracks) {
                if (undefined === allTracks.find(duplicate => duplicate.id === track.id)) {
                    allTracks.push(track)
                    addedTracks ++
                }
            }

            if (response.next) {
                moreAvailable = true
                uri = response.next
            } else {
                moreAvailable = false
            }
        } while (moreAvailable)
        console.log(`\t\t\tAdded ${addedTracks} tracks (removed duplicates)`)
    }
    console.log(`\tFound total of ${allTracks.length} tracks from ${allAlbums.length} albums`)
    // #endregion

    return {
        tracks: allTracks,
        albums: allAlbums
    }
}
const getAllArtistsTracks = async (auth, artists: SpotifyArtist[]) => {
    const allTracks: SpotifyTrack[] = []
    console.log(`\tFind all tracks from list of artists ...`)
    for (let i = 0; i < artists.length; i ++) {
        const artist = artists[i]
        console.log(`\t\tArtist ${i+1}/${artists.length} (${artist.name}) ...`)
        const { tracks, albums } = await getArtistTracks(auth, artist)
        console.log(`\t\t\tFound ${tracks.length} from artist`)
        let addedTracks = 0
        for (const track of tracks) {
            if (undefined === allTracks.find(duplicate => duplicate.id === track.id)) {
                allTracks.push(track)
                addedTracks ++
            }
        }
        console.log(`\t\t\tAdded ${addedTracks} tracks (removed duplicates)`)
    }
    console.log(`\tFound total of ${allTracks.length} tracks`)
    return allTracks
}
export const playTrack = async (auth, trackUri: string) => {
    const { access_token } = auth
    try {
        // POST https://api.spotify.com/v1/me/player/queue
        let response = await request({
            method: 'POST',
            uri: `https://api.spotify.com/v1/me/player/queue?uri=${ trackUri }`,
            headers: {
                Authorization: `Bearer ${ access_token }`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            resolveWithFullResponse: true
        })
        let statusCode = response.statusCode
        if (statusCode !== 204) {
            throw new Error(`playTrack | received unexpected statusCode when adding track to queue | statusCode: ${statusCode} trackUri: ${trackUri}`)
        }

        // Skip items in queue until the requested track is active.
        let currentlyPlayingTrack: SpotifyTrack
        let skippedTracks = 0
        do {
            if (currentlyPlayingTrack) {
                // Skip to next track in queue.
                response = await request({
                    method: 'POST',
                    uri: `https://api.spotify.com/v1/me/player/next`,
                    headers: {
                        Authorization: `Bearer ${ access_token }`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    resolveWithFullResponse: true
                })
                statusCode = response.statusCode
                if (statusCode !== 204) {
                    // Request failed. Don't throw an error, but stop the operation with a warning.
                    console.warn(`\tplayTrack | unexpected statusCode while skipping to requested track in queue | ${statusCode}`)
                    console.warn(`\tstopping queue skipping`)
                    return
                }
                skippedTracks ++
            }

            // GET https://api.spotify.com/v1/me/player/currently-playing
            let attempts = 0
            while (true) {
                attempts ++
                response = JSON.parse(await request({
                    method: 'GET',
                    uri: `https://api.spotify.com/v1/me/player/currently-playing`,
                    headers: {
                        Authorization: `Bearer ${ access_token }`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }))
                const updatedCurrentlyPlayingTrack = response.item as SpotifyTrack
                if (! currentlyPlayingTrack || (
                    currentlyPlayingTrack.id !== updatedCurrentlyPlayingTrack.id
                    // TODO: Might bug out if queue has two duplicate songs in a row
                )) {
                    currentlyPlayingTrack = updatedCurrentlyPlayingTrack
                    break
                }
                if (attempts > 10) {
                    console.warn(`\tplayTrack | couldn't confirm track skip after ${attempts} attempts`)
                    break
                }
            }
        } while (currentlyPlayingTrack.uri !== trackUri)

        if (skippedTracks > 0) {
            console.log(`\tSkipped ${skippedTracks} tracks. Now playing ${ currentlyPlayingTrack.name }`)
        }

    } catch (e) {
        console.error(`playTrack | unhandled error | ${e.message}`)
    }
}

export interface SpotifyPlaylist {
    description: string
    id: string
    href: string
    name: string
}

export interface SpotifyTrack {
    name: string
    href: string
    id: string
    uri: string
    artists: Array<SpotifyArtist>
    duration_ms: string
}

export interface SpotifyArtist {
    id: string
    name: string
    href: string
    uri: string
}

export interface SpotifyAlbum {
    href: string
    id: string
    name: string
    uri: string
}