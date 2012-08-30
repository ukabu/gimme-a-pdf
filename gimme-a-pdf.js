var fs            = require('fs')
var path          = require('path')
var glob          = require('glob')
var minimatch     = require('minimatch')
var url           = require('url')
var child_process = require('child_process')

var WATCHED_EXTENSIONS  = '+(*.json|*.json.txt)'
var ILLEGAL_CHAR_REGEXP = /[|:<>\\\/*]/g
var RASTERIZE_SCRIPT    = path.join(__dirname, 'lib', 'phantomjs', 'rasterize.js')
var watchedFolder       = process.argv[2] || '.'
var phantomjs           = process.argv[3] || 'phantomjs'
var delayWatchInfo      = {}
var DELAY_WATCH_DELAY   = 500

var FORMATS = {
  d: function convertFromDecimal(value, conversion, length) {
    function makePositiveDropDecimals(n) { return Math.floor(Math.abs(n)) }
    function zeroPad(length) { return new Array(length+1).join('0')}
    
    var minus = value < 0 ? '-' : ''
    value = makePositiveDropDecimals(+value)
    length = +length || 0

    string = new String(value)
    return minus + zeroPad(Math.max(string.length, length) - string.length) + string
  }
  , s: function convertFromString(value, conversion, length) {
    return value ? value.toString() : 'null'
  }
  , t: function convertFromDate(value, conversion) {
    var field = conversion.charAt(1)
    switch (field) {
      case 'm' : return FORMATS.d(value.getMonth() + 1, 'd', 2) // Month 1-12
      case 'd' : return FORMATS.d(value.getDate(), 'd', 2)      // day of month 1-31
      case 'Y' : return FORMATS.d(value.getFullYear(), 'd', 0)  // full year
      case 'H' : return FORMATS.d(value.getHours(), 'd', 2)
      case 'M' : return FORMATS.d(value.getMinutes(), 'd', 2)
      case 'I' : return FORMATS.d((value.getHours() % 12) + 1, 'd', 2)
      case 'p' : return value.getHours() >= 12 ? 'PM' : 'AM'
      case 'S' : return FORMATS.d(value.getSeconds(), 'd', 2)
      case 'L' : return FORMATS.d(value.getMilliseconds(), 'd', 3)
      case 'z' : return FORMATS.d(value.getTimezoneOffset() / 60, 'd', 2)+FORMATS.d(value.getTimezoneOffset() % 60, 'd', 2)
    }
  }
}

FORMATS_REGEXP = new RegExp([ /%/                        // start*
                            , /(?:(\d+)\$)?/             // position. ex: 1$
                            , /(?:(\d+)(?:\.(\d+))?)?/   // width & precision. ex: 2.5, 4
                            , /([dst][a-zA-Z]?)/         // conversion* function with optional subconversion. ex: d, s, tM
].map(function source(regexp) {return regexp.source}).join(''), 'g')

function format(formatString) {
  var autoPosition = 1
  var args = arguments
  return formatString.replace(FORMATS_REGEXP, function(match, position, length, decimal, conversion) {
    if (typeof position === 'undefined') {
      position = autoPosition
      autoPosition++
    }
    var value = args[position]

    if (typeof value === 'undefined') return match

    var conversionFunction = FORMATS[conversion.charAt(0)] || FORMATS.s
    return conversionFunction(value, conversion, length, decimal, position)
  })
}

function fixStringDate(stringDate) {
  return stringDate.replace(/at (\d\d):(\d\d)(AM|PM)/, function(match, hours, minutes, amORpm) {
    hours = amORpm === 'PM' ? (hours + 12) % 24 : hours
    return format('%2d:%2d', hours, minutes)
  })
}

function gimme_a_pdf(bookmark, callback) {
  console.info('gimme_a_pdf', bookmark)

  if (!bookmark.url) return callback(new Error('Bookmark does not contain a URL'));
  var date = bookmark.addedAt ? new Date(fixStringDate(bookmark.addedAt)) : new Date()
  var dateString = format('%1$tY-%1$tm-%1$td.%1$tH%1$tM.%1$tL', date)
  var outputBasename = (bookmark.title || url.parse(bookmark.url, true, true).pathname).replace(ILLEGAL_CHAR_REGEXP, '-') + ', ' + dateString+ '.pdf'

  child_process.spawn(phantomjs, [RASTERIZE_SCRIPT, bookmark.url, path.join(watchedFolder, outputBasename), 'Letter']).on('exit', function(code, signal) {
    if (code || signal) return callback(new Error('Conversion processed failled. Cause : '+(code | signal)));

    callback(null)
  })
}

function fileChanged(event, filename) {
  var basename = path.basename(filename)
  if (!minimatch(basename, WATCHED_EXTENSIONS, {matchBase: true})) return;

  fs.exists(filename, function(exist) {
    fs.readFile(filename, function(err, content){
      if (err) return console.error(err);

      gimme_a_pdf(JSON.parse(content), function(err) {
        if (err) return console.error(err);
        console.info('got a PDF, deleting bookmark')

        fs.unlink(filename)
      })
    })
  })
}

function delayWatch(event, filename) {
  if (delayWatchInfo[filename]) {
    clearTimeout(delayWatchInfo[filename])
    delete delayWatchInfo[filename]
  }
  delayWatchInfo[filename] = setTimeout(function() { fileChanged(event, filename) }, DELAY_WATCH_DELAY)
}

glob(WATCHED_EXTENSIONS, {cwd: watchedFolder}, function(err, files)  {
  if (err) return console.error(err)
  console.info(''+files.length+' bookmark(s) in backorder!')
  files.forEach(function(file) {
    process.nextTick(function() {fileChanged('change', path.join(watchedFolder, file))})
  })
})

fs.watch(watchedFolder, {persistent: true}).on('change', function(event, filename) { delayWatch(event, path.join(watchedFolder, filename)) })

