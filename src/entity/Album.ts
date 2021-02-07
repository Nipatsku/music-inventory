import { ManyToOne, OneToMany, PrimaryColumn } from "typeorm";
import {Entity, PrimaryGeneratedColumn, Column} from "typeorm";
import Artist from "./Artist";
import Track from "./Track";

@Entity()
export default class Album {

    @PrimaryColumn()
    id: string

    @Column()
    name: string

    @Column()
    href: string

    @Column()
    uri: string

    @Column({ default: false })
    tracksListed: boolean

    @Column({ nullable: true })
    tracksCount: number

    @Column({ nullable: true })
    tracksDurationMs: number

    @Column({ default: 0 })
    ratedTracksCount: number

    @Column({ default: false })
    allTracksRated: boolean

    @ManyToOne(type => Artist, artist => artist.albums)
    artist: Artist;

    @OneToMany(type => Track, track => track.album)
    tracks: Track[];

}
