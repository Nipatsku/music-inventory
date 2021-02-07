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

    /**
     * TODO: Should be acquired during login and so on.
     */
    const TEMP_PLAYLIST = '5sfVal7459RWClfmHNpCiC'

    // Add track to temp playlist.
    console.log(`\tAdding track to temp playlist ...`)
    // POST https://api.spotify.com/v1/playlists/{playlist_id}/tracks
    let response = await request({
        method: 'POST',
        uri: `https://api.spotify.com/v1/playlists/${TEMP_PLAYLIST}/tracks?uris=${trackUri}`,
        headers: {
            Authorization: `Bearer ${ access_token }`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        resolveWithFullResponse: true
    })
    let statusCode = response.statusCode
    if (statusCode < 200 || statusCode > 204) {
        // Error!
        throw new Error(`playTrack | unepected status code when adding song to temp playlist: ${statusCode}`)
    }

    // Play song from temp playlist.
    console.log(`\tPlacing track to active playback ...`)
    // PUT https://api.spotify.com/v1/me/player/play
    response = await request({
        method: 'PUT',
        uri: `https://api.spotify.com/v1/me/player/play`,
        headers: {
            Authorization: `Bearer ${ access_token }`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        resolveWithFullResponse: true,
        body: JSON.stringify({
            context_uri: 'spotify:playlist:'+TEMP_PLAYLIST,
            offset: {
                uri: trackUri
            }
        })
    })
    statusCode = response.statusCode
    if (statusCode < 200 || statusCode > 204) {
        // Error!
        throw new Error(`playTrack | unepected status code when setting playback state: ${statusCode}`)
    }

    console.log(`\tNow playing ${trackUri}`)
}
export const getUserCurrentPlayback = async (auth) => {
    const { access_token } = auth
    // GET https://api.spotify.com/v1/me/player
    const response = JSON.parse(await request({
        method: 'GET',
        uri: `https://api.spotify.com/v1/me/player/`,
        headers: {
            Authorization: `Bearer ${ access_token }`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }))
    if (response.currently_playing_type !== 'track') {
        return undefined
    }
    const track = response.item as SpotifyTrack
    return track
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