/**
 * --------------------------------------------------------
 * Ffmpeg Process
 * Author: Aichen
 * Copyright (c) 2019 Cloudseat.net
 * --------------------------------------------------------
 */

const fs = require('fs')
const stringToStream = require('string-to-stream')
const { execFile } = require('child_process')
const ffmpegPath = path.join(__dirname, 'assets/ffmpeg.exe')

function ffmpegCommand(args, options, callback) {
  loading(true)
  const process = execFile(ffmpegPath, args, options, (error, stdout, stderr) => {
    if (!(stderr instanceof Buffer)) loading(false)
    if (callback) callback(stderr)
    else if (error) {
      error = error.toString().trim()
      error = error.substring(error.lastIndexOf('\n') + 1)
      error = error.substring(error.lastIndexOf(':') + 1)
      alert(error)
    }
  })

  process.stderr.on('data', stderr => {
    const index = args.indexOf('-t')
    if (index > -1) {
      const duration = args[index + 1]
      const match = / time\=(\d{2}:\d{2}:\d{2}\.\d{2,3}) /.exec(stderr)

      if (match) {
        const time = util.parseDuration(match[1])
        const progress = Math.round((time / duration) * 100)
        loading(progress)
      }
    }
  })
  return process
}

function parseSegment(startTime, endTime) {
  const start = util.parseDuration(startTime)
  const end = util.parseDuration(endTime)
  if (start >= end) {
    alert('Start time cannot be later than end time')
    return false
  }
  return {
    start, duration: end - start
  }
}

function formatOutputFile(videoPath, startTime, endTime, extname) {
  const suffix = ('-' + startTime + '-' + endTime).replace(/:/g, '.')
  return videoPath + suffix + (extname || path.extname(videoPath))
}

module.exports = {

  cutVideo(videoPath, startTime, endTime) {
    const outputFile = formatOutputFile(videoPath, startTime, endTime)
    const segment = parseSegment(startTime, endTime)
    if (!segment) return

    // -i 放在 -ss 之前表示不使用关键帧技术；-i 放在 -ss 之后表示使用关键帧技术
    // 不使用关键帧剪切后视频开头可能存在几秒定格画面；使用关键帧截取速度快，但时间不精确，
    // 并且如果结尾不是关键帧，则可能出现一段空白（参数 avoid_negative_ts 可解决）
    return ffmpegCommand([
      '-ss', segment.start, '-t', segment.duration, '-accurate_seek', '-i', videoPath,
      '-vcodec', 'copy', '-acodec', 'copy', '-avoid_negative_ts', 1, '-y', outputFile
    ])
  },

  convertVideo(videoPath, startTime, endTime) {
    const outputFile = formatOutputFile(videoPath, startTime, endTime, '.mp4')
    const segment = parseSegment(startTime, endTime)
    if (!segment) return

    // crf=18 is very close to lossless
    return ffmpegCommand([
      '-i', videoPath, '-ss', segment.start, '-t', segment.duration,
      '-c:v', 'libx264', '-preset:v', 'veryfast', '-crf', 18, '-y', outputFile
    ])
  },

  extractAudio(videoPath, startTime, endTime) {
    const outputFile = formatOutputFile(videoPath, startTime, endTime, '.mp3')
    const segment = parseSegment(startTime, endTime)
    if (!segment) return

    return ffmpegCommand([
      '-ss', segment.start, '-t', segment.duration, '-i', videoPath,
      '-q:a', 0, '-vn', '-y', outputFile
    ])
  },

  captureImage(videoPath, timestamp) {
    const outputFile = formatOutputFile(videoPath, util.formatDuration(timestamp), 1, '.jpg')
    return ffmpegCommand([
      '-ss', timestamp, '-i', videoPath, '-vframes', 1,
      '-f', 'mjpeg', '-q:v', 2, '-y', outputFile
    ])
  },

  mergeVideos(videoPaths) {
    const outputFile = videoPaths[0] + '-merged' + path.extname(videoPaths[0])
    const process = ffmpegCommand([
      '-f', 'concat', '-safe', '0', '-protocol_whitelist', 'file,pipe',
      '-i', '-', '-c', 'copy', '-y', outputFile,
    ])

    const videoList = videoPaths.map(path => "file '" + path + "'").join('\n')
    stringToStream(videoList).pipe(process.stdin)
    return process
  },

  fastCodec(videoPath, startTime) {
    startTime = startTime || 0
    const file = fs.statSync(videoPath)

    // -frag_duration: Create fragments that are duration microseconds long.
    return ffmpegCommand([
      '-ss', startTime, '-i', videoPath, '-preset:v', 'ultrafast',
      '-f', 'mp4', '-frag_duration', 1000000, 'pipe:1',
    ], {
      encoding: 'buffer', maxBuffer: file.size,
    }, function() {})
  },

  getDuration(videoPath) {
    return new Promise(resolve => {
      ffmpegCommand(['-i', videoPath, '-'], function(stderr) {
        const match = /Duration\: ([0-9\:\.]+),/.exec(stderr)
        resolve(match ? util.parseDuration(match[1]) : 0)
      })
    })
  }

}
