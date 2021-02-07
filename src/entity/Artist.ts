import { OneToMany, PrimaryColumn } from "typeorm";
import {Entity, PrimaryGeneratedColumn, Column} from "typeorm";
import Album from "./Album";
import Track from "./Track";

@Entity()
export default class Artist {

    @PrimaryColumn()
    id: string

    @Column()
    name: string

    @Column()
    href: string

    @Column()
    uri: string

    @Column({ default: false })
    albumsListed: boolean

    @OneToMany(type => Album, album => album.artist)
    albums: Album[];

    @OneToMany(type => Track, track => track.artist)
    tracks: Track[];

}
