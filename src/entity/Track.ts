import { ManyToOne, PrimaryColumn } from "typeorm";
import {Entity, PrimaryGeneratedColumn, Column} from "typeorm";
import Album from "./Album";
import Artist from "./Artist";

@Entity()
export default class Track {

    @PrimaryColumn()
    id: string

    @Column()
    name: string

    @Column()
    href: string

    @Column()
    uri: string

    @Column()
    duration_ms: number

    @Column({ default: false })
    rated: boolean

    /**
     * Should be one of TrackRating enum
     */
    @Column({ nullable: true })
    rating: string

    @Column({ nullable: true })
    playedTimestamp: number

    @ManyToOne(type => Album, album => album.tracks)
    album: Album;

    @ManyToOne(type => Artist, artist => artist.tracks)
    artist: Artist;

}

export const TrackRating = {
    unrated: 'unrated',
    nope: 'NOPE',
    maybeAnotherTime: 'maybe',
    absolutely: 'absolutely',
    good: 'good',
    mediocre: 'mediocre'
}
