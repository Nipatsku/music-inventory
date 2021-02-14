# Music inventory

**Legendary** project with the goal of finding ALL the songs I like and storing the data into a database.

## Plan

1. List all ARTISTS that I ever listened to on Spotify = many artists.
2. List all SONGS by all those ARTISTS = **very** many songs.
3. Listen to all SONGs and give them a rating. Save rating to a database.

Make a web app that you can play and rate these with, so you can casually work on this huge project over time.


## Migrations

Build first !
npx typeorm schema:sync -c 'development'



## TODOs

- Ignore artists:
    * ennio morricone
- After confirming it as working, make better version for Hanna to use.


- Implement auto play for working days
    * App should automatically play through unrated songs
    * You should be able to rate previously played songs (not just currently playing one)
- Check if expected song is playing after ~5 seconds and try again automatically
    * Basically should keep checking if active Menu song is same as what Spotify is playing
- Improve layout on mobile
    * Song name is too small to see
- Option to play actually good songs when you get tired of crap
    * like play good music for 20 min or toggle
- BUG: Skipping song skips twice
- Analytics from speed of rating (ETA)