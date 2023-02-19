import express from "express";
import fs from 'fs';
import open from 'open';
import path from 'path';
import SysTray, { MenuItem } from "systray2";
import api from './api';

import { PORT, SOUND_FOLDER } from "./config";

const publicPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '../public')
    : '.';

const app = express();


app.use(express.static(publicPath));

app.use("/api", api);

app.use("/files", express.static(SOUND_FOLDER));

app.get('*', (req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });

app.listen(PORT, () => { console.log(`App listening on port ${PORT}`); });

let menuItems: (MenuItem & { id?: string })[] = [
    {
        title: "Öffnen",
        checked: false,
        enabled: true,
        id: "open",
        tooltip: ""
    },
    SysTray.separator,
    {
        title: "Beenden",
        checked: false,
        enabled: true,
        id: "exit",
        tooltip: ""
    }
];

const systray = new SysTray({
    menu: {
        icon: fs.readFileSync(path.join(publicPath, 'favicon.ico'), { encoding: 'base64' }),
        title: "Soundboard",
        tooltip: "",
        items: menuItems
    }
});

systray.onClick(action => {
    let id = menuItems[action.seq_id].id;

    switch (id) {
        case 'exit':
            process.exit(0);
            break;
        case 'open':
            const openPort = process.env.NODE_ENV === 'development' ? 3000 : PORT;
            open(`http://localhost${openPort === 80 ? '' : (':' + openPort)}`)
            break;
    }
})