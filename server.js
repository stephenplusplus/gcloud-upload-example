'use strict';

var async = require('async');
var express = require('express');
var levelup = require('levelup');
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
  res.render('index', {
    simple: false,
    complex: false
  });
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
  // Display a list of files from the bucket after uploading is complete.
  res.redirect('/files');
});

// ------------------------
// STREAMING FILE DOWNLOAD.
// ------------------------
// This opens a readable stream from the file, then pipes it to the response.
app.get('/file/:filename', function(req, res) {
  var file = bucket.file(req.params.filename);
  file.createReadStream().pipe(res);
});

// --------------------------
// GCS-BACKED FILE DOWNLOADS.
// --------------------------
// This route will get all of the files in a bucket, generate a signed URL for
// each, then render the front end which will display the download links.
//
// The signed URLs are created once, then stored in a local database using
// levelup -- http://gitnpm.com/levelup.
var db = levelup('./filename-to-url');

app.get('/files', function(req, res) {
  bucket.getFiles(function(err, files) {
    if (err) {
      res.emit('error', err);
      res.end();
      return;
    }

    async.map(files, assignSignedUrl, function(err, files) {
      if (err) {
        res.emit('error', err);
        res.end();
        return;
      }

      res.render('files', {
        files: files
      });
    });
  });

  function assignSignedUrl(file, callback) {
    // Check if we have already assigned a signed URL for this file.
    db.get(file.name, function(err, value) {
      if (value) {
        file.signedUrl = value;
        callback(null, file);
        return;
      }

      file.getSignedUrl({
        action: 'read',
        expires: '2025'
      }, function(err, url) {
        if (err) {
          callback(err);
          return;
        }

        db.put(file.name, url, function(err) {
          if (err) {
            callback(err);
            return;
          }

          file.signedUrl = value;
          callback(null, file);
        });
      });
    });
  }
});
