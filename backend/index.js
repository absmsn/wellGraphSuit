const express = require('express');
const app = express();
const compression = require('compression');
const port = 8000;
const path = require("path");

var mockPointNum = 100;
var xyRange = 100, zRange = 100;

function getTrackPoints() {
    var points = [];
    for(var i = 0; i < mockPointNum; i++) {
        points.push({
            x: Math.random() * xyRange * 2 - xyRange,
            y: Math.random() * xyRange * 2 - xyRange,
            depth: (zRange / mockPointNum) * i
        });
    }
    return points;
}

app.get('/designTrackPoints', (req, res) => {
    var points = getTrackPoints();
    res.send(points);
});

app.get('/realTrackPoints', (req, res) => {
    var points = getTrackPoints();
    res.send(points);
});

app.get('/designTargetPoints', (req, res) => {
    res.send([]);
});

app.get('/realTargetPoints', (req, res) => {
    res.send([]);
});

app.get("/wellName", (req, res) => {
    res.send([{jhbm: "测试"}]);
});

app.get("/wellNO", (req, res) => {
    res.send([]);
});

app.use(compression());
app.use(express.static(path.join(__dirname, "../")));

app.listen(port, () => {
  console.log(`listening at http://localhost:${port}`)
});
