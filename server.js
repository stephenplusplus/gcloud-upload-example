'use strict';

var express = require('express');
var multer = require('multer');

var gcloud = require('gcloud')({
  projectId: process.env.GCLOUD_PROJECT_ID,
  keyFilename: process.env.GCLOUD_KEY_FILENAME
});
var gcs = gcloud.storage();
var bucket = gcs.bucket(process.env.GCLOUD_BUCKET);

var app = express();
require('lodash-express')(app, 'html');
app.set('view engine', 'html');
app.listen(8080);

app.get('/', function(req, res) {
  res.render('index', { simple: false, complex: false });
});

// ---------------
// SIMPLE UPLOADS.
// ---------------
// This uses a pre-determined file.
app.get('/simple', function(req, res) {
  var file = bucket.file('file.jpg');

  file.createResumableUpload({
    metadata: {
      contentType: 'application/jpg'
    }
  }, function(err, uri) {
    if (err) {
      res.emit('error', err);
      res.end();
      return;
    }

    res.render('index', {
      simple: true,
      complex: false,
      uri: uri
    });
  });
});

// ----------------
// COMPLEX UPLOADS.
// ----------------
// Let the client decide the file to upload.
var upload = multer({
  storage: {
    _handleFile: function(req, incomingFile, next) {
      var file = bucket.file(incomingFile.originalname);

      incomingFile.stream
        .pipe(file.createWriteStream({
          metadata: {
            contentType: incomingFile.mimeType
          }
        }))
        .on('error', next)
        .on('finish', next);
    },
    _removeFile: function(req, incomingFile, next) {
      next();
    }
  }
});

app.get('/complex', function(req, res) {
  res.render('index', {
    simple: false,
    complex: true
  });
});

app.post('/upload', upload.single('file'), function(req, res) {
  res.redirect('/');
});
