import * as dotenv from 'dotenv'
dotenv.config()
import "reflect-metadata";
import * as express from 'express'
import { Request, Response } from 'express'
import * as request from 'request-promise-native'
import { createConnection } from 'typeorm'
import { IUserActivePlayback, IUserProfile } from './interfaces';
import { User } from './entity/User';
import { doStuff, getRecentlyPlayedTracks, playUnratedTrack, rateTrack } from './logic';
import Track, { TrackRating } from './entity/Track';
import { getUserCurrentPlayback } from './spotify/utils';


let BACKEND_URL
let PORT
let MODE
let SPOTIFY_CLIENT_ID
let SPOTIFY_CLIENT_SECRET

//#region *** .env ***

const parseEnv = ( name ) => {
    const value = process.env[name]
    if ( value === undefined ) throw new Error(`Missing .env variable: ${ name}`)
    return value
}
MODE = process.env.NODE_ENV || 'development'
PORT = parseEnv( 'PORT' )
BACKEND_URL = parseEnv( 'BACKEND_URL' )
SPOTIFY_CLIENT_ID = parseEnv( 'SPOTIFY_CLIENT_ID' )
SPOTIFY_CLIENT_SECRET = parseEnv( 'SPOTIFY_CLIENT_SECRET' )

//#endregion

//#region *** Authorization code auth flow ***

/**
 * Exchange auth code for access + refresh tokens.
 */
const getAccessTokens = async ( authCode, redirectUri ) => {
    return JSON.parse(
        await request({
            method: 'POST',
            uri: 'https://accounts.spotify.com/api/token',
            headers: {
                Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            form: {
                'grant_type': 'authorization_code',
                'code': authCode,
                'redirect_uri': redirectUri
            }
        })
    )
}

/**
 * Refresh access + refresh tokens.
 */
const refreshAccessTokens = async ( refreshToken ) => {
    return JSON.parse(
        await request({
            method: 'POST',
            uri: 'https://accounts.spotify.com/api/token',
            headers: {
                Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            form: {
                'grant_type': 'refresh_token',
                'refresh_token': refreshToken
            }
        })
    )
}

//#endregion

//#region *** Spotify helper functions ***

const getUserProfile = async ( auth ) => {
    const { access_token } = auth
    return JSON.parse(
        await request({
            method: 'GET',
            uri: 'https://api.spotify.com/v1/me',
            headers: {
                Authorization: `Bearer ${ access_token }`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
    ) as IUserProfile
}

//#endregion

;(async () => {
    const Database = await createConnection( MODE )
    const UserRepository = Database.getRepository( User )

    const port = PORT
    const app = express()
    
    app.listen( port, function () {
        console.log("Server is running on "+ port +" port");
    })

    app.get('/login', function(req, res) {
        console.log('\tRedirect login.')

        const scopes = [
            'user-read-private',
            'user-read-playback-state',
            'user-modify-playback-state',
            'user-top-read',
            'playlist-modify-public',
            'playlist-modify-private',
            'playlist-read-private'
        ].join(' ')
        const redirectUri = `${BACKEND_URL}/login-redirect`
    
        res.redirect('https://accounts.spotify.com/authorize' +
          '?response_type=code' +
          '&client_id=' + SPOTIFY_CLIENT_ID +
          (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
          '&redirect_uri=' + encodeURIComponent(redirectUri) +
          '&state=' + encodeURIComponent(JSON.stringify({ redirectUri })) +
          '&show_dialog=true'
        );
    })
    
    app.get('/login-redirect', async function(req, res) {
        console.log('\t->Redirect login')
        const url = req.url
        
        let error
        try {
            error = url.match( /error=([^\&]*)/ )[1]
            console.error(`auth error: ${ error }`)
            return
        } catch ( e ) {}
    
        let state = url.match( /state=([^\&]*)/ )[1]
        state = JSON.parse(decodeURIComponent(state))
        const { redirectUri } = state
    
        const code = url.match( /code=([^\&]*)/ )[1]


        console.log(`\tAuthenticating...`)
        const auth = await getAccessTokens( code, redirectUri )
        console.log(`\t\tauth: `, auth)


        // * Get user info from Spotify *
        console.log(`\tGetting user information...`)
        const info = await getUserProfile( auth )
        console.log( `\t\tuser info: `, info )


        // Check if User is already in database.
        let user = await UserRepository.findOne({ where: { id: info.id } })
        if ( ! user ) {
            // New user.
            console.log(`\tFirst time login as ${ info.display_name }`)
            user = new User()
            const userProperties = {} as Partial<User>
            userProperties.access_token = auth.access_token
            userProperties.refresh_token = auth.refresh_token
            userProperties.id = info.id
            userProperties.display_name = info.display_name
            userProperties.uri = info.uri
            userProperties.href = info.href

            for ( const key in userProperties ) {
                user[key] = userProperties[key]
            }
            user = await UserRepository.save( user )
            console.log(`\t\tSaved user to database`)

        } else {
            // Old user.
            const userProperties = {} as Partial<User>
            userProperties.access_token = auth.access_token
            userProperties.refresh_token = auth.refresh_token
            await UserRepository.update( user.id, userProperties )
            user = await UserRepository.findOne( user.id )
            console.log(`\t\tUpdated user access tokens`)
        }

        console.log(`\t\tuser: `, user)
        res.send(`Login information saved. Your ID is ${ user.id }`)
    })

    // Test code
    const user = await UserRepository.findOne()
    let auth = user.getAuth()
    auth = await refreshAccessTokens(user.refresh_token)
    setInterval(async () => {
        auth = await refreshAccessTokens(user.refresh_token)
    }, 10 * 60 * 1000)
    
    doStuff( auth, Database )

    app.get('/play', async function(req, res) {
        const track = await playUnratedTrack(auth, Database)
        console.log(`Now playing ${track.name} by ${track.artist.name}`)
        console.log(`Redirecting user to menu`)
        res.redirect(`${BACKEND_URL}/menu?trackId=${track.id}`)
    })

    app.get('/menu', async function(req, res) {
        const trackId = req.url.match(/trackId=([^&/]*)/)[1]
        // Check if song is over.
        const currentPlayback = await getUserCurrentPlayback(auth)
        if (! currentPlayback || currentPlayback.id !== trackId) {
            // Queue next song.
            return res.redirect(`${BACKEND_URL}/play`)
        }

        // Get recently played songs for rating.
        const recentlyPlayedTracks = await getRecentlyPlayedTracks(auth, Database)
        const ratingKeys = Object.keys(TrackRating)
        const ratingLabels = ratingKeys.map(key => TrackRating[key])
        res.send(`<html><head>
            <title>Music Inventory</title>
            <style>
                body {
                    display: flex;
                    flex-direction: column;
                    text-align: center;
                    overflow-y: auto;
                }
                .title-small {
                    font-size: 8.0vw;
                }
                .title-big {
                    font-size: 10.0vw;
                }
                .recently-played {
                    margin-top: 20vh;
                    font-size: 6.0vw;
                }
                .rate-button {
                    font-size: 6.0vw;
                    background-color: rgba(200,200,200);
                    padding: 10px 0px;
                    margin-top: 1.0em;
                    margin-bottom: 1.0em;
                }
            </style>
        </head>
        <body>
            <span class='title-small'>Listening to</span>
            <span class='title-big'><b>${currentPlayback.name}</b></span>
            <span class='title-small'>by ${currentPlayback.artists[0].name}</span>
            <span class='recently-played'>Recently played:</span>
            ${recentlyPlayedTracks.map((track, i) => 
                `<span class='rate-button' onclick='rate(${i})'>${track.name}</span>`
            ).join('\n')}
            <script>
                let rating = false
                function rate(iTrack) {
                    rating = true
                    const track = [${recentlyPlayedTracks.map(track => `${JSON.stringify({ name: track.name, artist: track.artist.name, id: track.id })}`).join(', ')}][iTrack]
                    document.body.innerHTML = "<span class='title-small'>Rating <b>"+track.name+"</b> by "+track.artist+"</span>" + ${ratingLabels.map( (rating, i) =>
                        `"<a class='rate-button' href=${`${BACKEND_URL}/rate-track?trackId="+track.id+"&rating=${ratingKeys[i]}`}>${rating}</a>"`
                    ).join(' + ')}
                    setTimeout(() => {
                        window.location.reload()
                    }, 10000)
                }
                setTimeout(() => {
                    if (!rating) window.location.reload()
                }, 3000)
            </script>
        </body>
        </html>
        `)
    })

    app.get('/rate-track', async function(req, res) {
        try {
            const trackId = req.url.match(/trackId=([^&/]*)/)[1]
            const rating = TrackRating[req.url.match(/rating=([^&/]*)/)[1]]
            await rateTrack(auth, Database, trackId, rating)

            // Play next track automatically if rating suggests so.
            const shouldPlayNextTrack = [
                TrackRating.nope,
                TrackRating.unrated,
                TrackRating.maybeAnotherTime,
                TrackRating.mediocre,
            ].includes(rating)

            if (shouldPlayNextTrack) {
                console.log(`Playing next track automatically`)
                return res.redirect(`${BACKEND_URL}/play`)
            } else {
                // Wait for song to end.
                return res.redirect(`${BACKEND_URL}/menu-wait?trackId=${trackId}`)
            }
        } catch (e) {
            console.error(`/rate-track | Unhandled error ${e.message}`)
            res.send('An error occured, the rating was not saved :(')
        }
    })

    app.get('/menu-wait', async function(req, res) {
        const trackId = req.url.match(/trackId=([^&/]*)/)[1]
        // Check if song is over.
        const currentPlayback = await getUserCurrentPlayback(auth)
        if (! currentPlayback || currentPlayback.id !== trackId) {
            // Queue next song.
            return res.redirect(`${BACKEND_URL}/play`)
        }
        // Schedule next recheck.
        res.send(`<html><head><title>Music Inventory - listening to ${currentPlayback.artists[0].name}</title></head><body>
            <h1>Now listening to <b>${currentPlayback.name}</b> by ${currentPlayback.artists[0].name}</h1>
            <a href=${BACKEND_URL}/play style='font-size: 2.0em'>Skip<a/>
            <script>
                setTimeout(() => {
                    window.location.reload()
                }, 3000)
            </script>
        </body></html>`)
    })

})()
