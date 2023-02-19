import express from "express";
import fs from 'fs';
import ip from 'ip';
import { Lame } from 'node-lame';
import QRCode from "qrcode";
import stream from 'stream';
import * as wav from 'wav';
import { PORT, SOUND_FOLDER } from "./config";

import * as PortAudio from 'naudiodon';

export const api = express();

api.use(express.json())
api.use(express.urlencoded({ extended: true }))

const KNOWN_EXTENSIONS = ['wav']; // ['mp3', 'wav', 'ogg', 'm4a'];

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
                        title: f
                    } as SoundInfo
                }
            });


        res.send(sounds);
    } catch (error) {
        next(error);
    }
})

const audios: { [id: number]: PortAudio.IoStreamWrite } = {};
let AUDIO_ID = 0;
api.post('/play', async (req, res, next) => {
    try {
        AUDIO_ID++;

        const file = req.body.file;
        const deviceId = parseInt(req.body.deviceId) || -1;

        const filePath = `${SOUND_FOLDER}/${file}`;

        let audioOptions: PortAudio.AudioOptions = {
            channelCount: 1,
            sampleFormat: PortAudio.SampleFormat16Bit,
            sampleRate: 48000,
            deviceId: deviceId, // Use -1 or omit the deviceId to select the default device
            closeOnError: true // Close the stream if an audio error is detected, if set false then just log the error
        };

        const extension = file.toLowerCase().substring(file.lastIndexOf('.') + 1);

        let audioStream: stream.Readable;
        if (extension === 'mp3') {
            const decoder = new Lame({ output: "buffer", bitwidth: 16, resample: 48 }).setFile(filePath);
            const emitter = decoder.getEmitter();
            emitter.on("error", (error) => console.error("Decode error: ", error));
            emitter.on("format", (f) => console.log("format", f))
            emitter.on("data", (d) => console.log("data", d))
            let buffer = await decoder.decode().then(() => decoder.getBuffer()).catch(console.error);
            audioStream = new stream.PassThrough().end(buffer);
        } else if (extension === 'wav') {
            let fileStream = fs.createReadStream(filePath);
            const reader = new wav.Reader();

            fileStream.pipe(reader);
            await new Promise<void>((res, rej) => {
                reader.on("format", f => {
                    audioOptions.channelCount = f.channels;
                    audioOptions.sampleRate = f.sampleRate;
                    audioOptions.sampleFormat = f.bitDepth as (1 | 8 | 16 | 24 | 32);
                    res();
                });
            });

            audioStream = reader;
        } else {
            throw new Error(`Unknown file extension '${extension}'`);
        }

        let audioOutput = PortAudio.AudioIO({
            outOptions: audioOptions
        });

        audioOutput.on('error', e => console.log("error", e))


        console.log(`Playing ${extension} file '${file}' on ${deviceId}...`)

        audioStream.on('error', () => {
            console.log("audioStream.error");
            audioOutput.quit(() => {
                console.log(`Finished playing ${file}`);
                delete audios[AUDIO_ID];
            });
        });

        audioStream.on('end', () => {
            console.log(`Finished playing ${file}`);
            audioOutput.quit(() => {
                console.log(`Finished playing ${file}`);
                delete audios[AUDIO_ID];
            });
        });

        audioStream.pipe(audioOutput);

        setTimeout(() => audioOutput.start(), 0);

        audios[AUDIO_ID] = audioOutput;

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