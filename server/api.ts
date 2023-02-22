import express from "express";
import fs from 'fs';
import ip from 'ip';
// @ts-ignore:next-line
import AV from 'av';
import QRCode from "qrcode";
import stream from 'stream';
import * as wav from 'wav';
require('mp3');

import { PORT, SOUND_FOLDER } from "./config";

import _ from "lodash";
import * as PortAudio from 'naudiodon';

export const api = express();

api.use(express.json())
api.use(express.urlencoded({ extended: true }))

const KNOWN_EXTENSIONS = ['wav', 'mp3']; //, 'wav', 'ogg', 'm4a'];

interface SoundInfo {
    fileName: string
    title: string
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
                    } as SoundInfo
                }
            });


        res.send(sounds);
    } catch (error) {
        next(error);
    }
})

const audioDevices: { options: PortAudio.AudioOptions, device: PortAudio.IoStreamWrite }[] = [];

function getAudioDeviceForOptions(options: PortAudio.AudioOptions) {
    options.closeOnError = false;

    let entry = audioDevices.filter(p => _.isEqual(p.options, options))[0];
    if (entry === undefined) {
        let device = PortAudio.AudioIO({
            outOptions: { ...options }
        });
        entry = {
            options: { ...options },
            device: device
        };
        audioDevices.push(entry);

        device.start();
    }

    return entry.device;
}

const audios: { [id: number]: PortAudio.IoStreamWrite } = {};
let AUDIO_ID = 0;
let currentlyPlaying = 0;
api.post('/play', async (req, res, next) => {
    try {
        if (currentlyPlaying > 0) {
            res.sendStatus(423);
            return;
        }

        AUDIO_ID++;

        const file = req.body.file;
        const deviceId = parseInt(req.body.deviceId) || -1;

        const filePath = `${SOUND_FOLDER}/${file}`;

        let audioOptions: PortAudio.AudioOptions = {
            channelCount: 1,
            sampleFormat: PortAudio.SampleFormat16Bit,
            sampleRate: 48000,
            deviceId: deviceId, // Use -1 or omit the deviceId to select the default device
            closeOnError: false // Close the stream if an audio error is detected, if set false then just log the error
        };

        const extension = file.toLowerCase().substring(file.lastIndexOf('.') + 1);

        let duration: number
        let audioStream: stream.Readable;
        if (extension === 'mp3') {
            let decoder = AV.Asset.fromBuffer(fs.readFileSync(filePath));

            decoder.on("error", e => console.error(e));

            const buffer: Float32Array = await new Promise((res, rej) => decoder.decodeToBuffer(buffer => res(buffer)));

            const passThrough = new stream.PassThrough();
            passThrough.end(Buffer.from(buffer.buffer));
            audioStream = passThrough;

            audioOptions.sampleFormat = PortAudio.SampleFormatFloat32;
            audioOptions.sampleRate = decoder.format!.sampleRate;
            audioOptions.channelCount = decoder.format!.channelsPerFrame;

            duration = decoder.duration ?? 0;
        } else if (extension === 'wav') {
            const fileSize = fs.lstatSync(filePath).size;
            const fileStream = fs.createReadStream(filePath);
            const reader = new wav.Reader();

            fileStream.pipe(reader);
            await new Promise<void>((res, rej) => {
                reader.on("format", f => {
                    audioOptions.channelCount = f.channels;
                    audioOptions.sampleRate = f.sampleRate;
                    audioOptions.sampleFormat = f.bitDepth as (1 | 8 | 16 | 24 | 32);
                    res();
                });
                reader.on("error", e => rej(e));
            });

            audioStream = reader;

            duration = fileSize / ((audioOptions.sampleRate! / 1000) * (audioOptions.sampleFormat! / 8));
        } else {
            throw new Error(`Unknown file extension '${extension}'`);
        }

        let audioOutput = getAudioDeviceForOptions(audioOptions);

        console.log(`Playing ${extension} file '${file}' on ${deviceId}...`)

        audioStream.on('end', () => {
            /* finished streaming to audio device */
        });



        audioStream.pipe(audioOutput, { end: false });

        currentlyPlaying++;

        console.log(`playing ${currentlyPlaying} sounds`)

        setTimeout(() => {
            console.log(`Finished playing ${file}`);
            currentlyPlaying--;
        }, Math.max(0, duration - 500));

        res.send();
    } catch (error) {
        console.log(`error ${error}`)

        next(error);
    }
});


api.delete('/sound/:id', (req, res, next) => {
    try {
        let id = parseInt(req.params.id);
        let audio = audios[id];
        audio?.abort();
        delete audios[id];

        res.send();
    } catch (error) {
        next(error);
    }
})

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
})

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