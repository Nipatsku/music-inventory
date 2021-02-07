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
    
    doStuff( auth, Database )

    app.get('/play-unrated', async function(req, res) {
        await playUnratedTrack(auth, Database)
        res.redirect(`${BACKEND_URL}/rate`)
    })

    // TODO: Automatically add more unrated songs into queue? How to best manage this..?
    // Maybe via front end ..?

    app.get('/rate', async function(req, res) {
        const recentlyPlayedTracks = await getRecentlyPlayedTracks(auth, Database)
        const track = recentlyPlayedTracks[0]
        if (!track) {
            return res.send('No recently played tracks.')
        }
        const ratingKeys = Object.keys(TrackRating)
        const ratingLabels = ratingKeys.map(key => TrackRating[key])
        res.send(`<html><head>
            <style>
                body {
                    font-size: 1.0vw;
                }
                .column {
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    height: 100%;
                }
                .title {
                    font-size: 3.0vw;
                }
                .button {
                    font-size: 6.0vh;
                    text-decoration: none;
                    color: white;
                    background-color: black;
                    border-radius: 10px;
                    padding: 0px 5px;
                    margin: 5px;
                    text-align: center;
                }
                .button:hover {
                    cursor: pointer;
                    opacity: 0.6;
                }
            </style>
        </head><body>
            <div class='column'>
            <span class='title'>Please select your rating of <b>${track.name}</b> by ${track.artist.name}</span>
            ${ratingLabels.map( (rating, i) =>
                `<a class='button' href=${`${BACKEND_URL}/rate-redirect?trackId=${track.id}&rating=${ratingKeys[i]}`}>${rating}</a>`
            ).join('\n')}
            <br/>
            </div>
        </body></html>`)
    })

    app.get('/rate-redirect', async function(req, res) {
        try {
            const trackId = req.url.match(/trackId=([^&/]*)/)[1]
            const rating = TrackRating[req.url.match(/rating=([^&/]*)/)[1]]
            await rateTrack(auth, Database, trackId, rating)
            res.redirect(`${BACKEND_URL}/rate-wait-for-song-to-end?trackId=${trackId}`)
        } catch (e) {
            console.error(`/rate-redirect | Unhandled error ${e.message}`)
            res.send('An error occured, the rating was not saved :(')
        }
    })

    app.get('/rate-wait-for-song-to-end', async function(req, res) {
        const trackId = req.url.match(/trackId=([^&/]*)/)[1]
        // Check if song is over.
        const currentPlayback = await getUserCurrentPlayback(auth)
        if (! currentPlayback || currentPlayback.id !== trackId) {
            // Redirect to rating.
            return res.redirect(`${BACKEND_URL}/rate`)
        }
        // Schedule next recheck.
        res.send(`<html><body>
            <h1>Waiting for song to end...</h1>
            <script>
                setTimeout(() => {
                    window.location.reload()
                }, 1000)
            </script>
        </body></html>`)
    })

})()
