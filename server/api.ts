import { spawn } from 'child_process';
import express from 'express';
import fs from 'fs';
import ip from 'ip';
import * as PortAudio from 'naudiodon';
import path from 'path';
import QRCode from 'qrcode';

import { PORT, SOUND_FOLDER } from './config';

export const api = express();

api.use(express.json());
api.use(express.urlencoded({ extended: true }));

const KNOWN_EXTENSIONS = ['wav', 'mp3']; //, 'wav', 'ogg', 'm4a'];

interface SoundInfo {
    fileName: string;
    title: string;
}


if (!(fs.existsSync(SOUND_FOLDER) && fs.lstatSync(SOUND_FOLDER).isDirectory())) {
    try {
        fs.mkdirSync(SOUND_FOLDER);
    } catch (e) {
        console.log(`Could not create sound folder '${SOUND_FOLDER}'. ${e}`);
        process.exit(1);
    }
}

api.get("/link", async (req, res, next) => {
    try {
        console.log(req);
    } catch (error) {
        next(error);
    }
});


api.get("/devices", async (req, res, next) => {
    try {
        res.send({ devices: PortAudio.getDevices().filter((d: any) => d.maxOutputChannels > 0), hostApis: PortAudio.getHostAPIs().HostAPIs });
    } catch (error) {
        next(error);
    }
});

api.get("/files", (req, res, next) => {
    try {
        let files = fs.readdirSync(SOUND_FOLDER);

        let sounds = files
            .filter(f => KNOWN_EXTENSIONS.findIndex(ext => f.toLowerCase().endsWith('.' + ext)) !== -1)
            .map(f => {
                try {
                    return JSON.parse(fs.readFileSync(SOUND_FOLDER + '/' + f + '.json', 'utf8')) as SoundInfo;
                } catch (e) {
                    return {
                        fileName: f,
                        title: f.substring(0, f.lastIndexOf('.') || f.length)
                    } as SoundInfo;
                }
            });


        res.send(sounds);
    } catch (error) {
        next(error);
    }
});


let OUTPUT_DEVICE = "";

api.get("/outputDevice", async (req, res, next) => {
    try {
        res.setHeader("Content-Type", "application/json");
        res.send(JSON.stringify({ "name": OUTPUT_DEVICE }));
    } catch (e) {
        console.log(`error ${e}`);
        next(e);
    }
});

api.post("/outputDevice", async (req, res, next) => {
    try {
        OUTPUT_DEVICE = req.body.name;
        console.log("set output device: '" + OUTPUT_DEVICE + "'");
        res.sendStatus(200);
    } catch (e) {
        console.log(`error ${e}`);
        next(e);
    }
});


api.post('/play', async (req, res, next) => {
    try {
        const file = req.body.file;

        const filePath = path.resolve(`${SOUND_FOLDER}/${file}`);

        console.log(`Playing '${file}' on device '${OUTPUT_DEVICE}'...`);

        var process = spawn("C:\\Program Files\\VideoLAN\\VLC\\vlc.exe", [
            "-Incurse",
            "--play-and-exit",
            "--aout=waveout",
            "--waveout-audio-device=" + OUTPUT_DEVICE + "",
            filePath
        ], { stdio: 'ignore' });
        if (!process) {
            throw new Error("Unable to spawn vlc process");
        }

        process.on('close', (e: any) => {
            if (e) { console.error("Error playing: ", e); }

            console.log(`Finished playing ${file}`);
        });


        res.send();
    } catch (error) {
        console.log(`error ${error}`);

        next(error);
    }
});


api.delete('/sound/:id', (req, res, next) => {
    try {
        let id = parseInt(req.params.id);
        // let audio = audios[id];
        // audio?.abort();
        // delete audios[id];

        res.send();
    } catch (error) {
        next(error);
    }
});

function getLocation() {
    const openPort = process.env.NODE_ENV === 'development' ? 3000 : PORT;
    return `http://${ip.address()}${openPort === 80 ? '' : (':' + openPort)}`;
}


api.get('/location', async (req, res, next) => {
    try {
        res.setHeader("Content-Type", "application/json");
        res.send(JSON.stringify({ "location": getLocation() }));
    } catch (e) {
        next(e);
    }
});

api.get('/location.png', async (req, res, next) => {
    try {
        res.setHeader("Content-Type", "image/png");
        QRCode.toFileStream(res, getLocation(), {
            scale: 10,
            margin: 0,
            type: 'png'
        });
    } catch (e) {
        next(e);
    }
});

export default api;