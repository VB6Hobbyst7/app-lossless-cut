/**
 * --------------------------------------------------------
 * Renderer Process
 * Author: Aichen
 * Copyright (c) 2019 Cloudseat.net
 * --------------------------------------------------------
 */

const electron = require('electron')
const path = require('path')
const ffmpeg = require('./ffmpeg')
const Merge = require('./merge')
const Recorder = require('./recorder')
const { dialog, getGlobal } = electron.remote

const openFileBtn = $('#open-file')
const currentTime = $('#currentTime')
const timeline = $('.timeline')
const duration = $('#duration')
const progress = $('#progress')
const segment = $('#segment')
const cutStartTime = $('#cut-start-time')
const cutEndTime = $('#cut-end-time')
const playBtn = $('.play')
const videoStartBtn = $('.video-start')
const videoEndBtn = $('.video-end')
const segmentStartBtn = $('.segment-start')
const segmentEndBtn = $('.segment-end')
const cutStartBtn = $('.cut-start')
const cutEndBtn = $('.cut-end')
const captureBtn = $('.capture')
const extractBtn = $('.extract')
const cutBtn = $('.cut')
const convertBtn = $('.convert')
const openFilesBtn = $('.open-files')
const recordBtn = $('.record')

const video = $('video')
Object.assign(video, require('./video'))

const recorder = new Recorder()
const merge = new Merge()
merge.onmerge = function() {
  ffmpeg.mergeVideos(video.sources)
}

/* --------------------------------------------------------
 * Renderer Events
 * ----------------------------------------------------- */

openFileBtn.ondragover = function(e) {
  return false
}

openFileBtn.ondragenter = function(e) {
  e.preventDefault()
  this.classList.add('ondrag')
}

openFileBtn.ondragleave = function(e) {
  e.preventDefault()
  this.classList.remove('ondrag')
}

openFileBtn.ondrop = function(e) {
  e.preventDefault()
  let path = e.dataTransfer.files[0].path
  if (path) video.setSource(path)
}

openFileBtn.onclick = async function() {
  const { canceled, filePaths } = await openFileDialog()
  if (!canceled && filePaths && filePaths.length == 1) {
    video.setSource(filePaths[0])
  }
}

openFilesBtn.onclick = async function() {
  const { canceled, filePaths } = await openFileDialog(true)

  if (!canceled && filePaths && filePaths.length > 1) {
    video.sources = filePaths
    merge.setFileList(filePaths)
  }
}

playBtn.onclick = play = function() {
  if (video.paused) {
    if (video.ended) video.seek(0)
    video.play()
    playBtn.className = 'pause'
  } else {
    video.pause()
    playBtn.className = 'play'
  }
}

cutBtn.onclick = function() {
  ffmpeg.cutVideo(video.source, cutStartTime.value, cutEndTime.value)
}

convertBtn.onclick = function() {
  ffmpeg.convertVideo(video.source, cutStartTime.value, cutEndTime.value)
}

extractBtn.onclick = function() {
  ffmpeg.extractAudio(video, cutStartTime.value, cutEndTime.value)
}

captureBtn.onclick = function() {
  ffmpeg.captureImage(video.source, video.getCurrentTime())
}

recordBtn.onclick = function() {
  recorder.show()
}

timeline.onclick = function(e) {
  if (video.getDuration() !== undefined)
  video.seek(video.getDuration() * (e.clientX / this.offsetWidth))
}

cutStartBtn.onclick = function() {
  cutStartTime.value = formatDuration(video.getCurrentTime())
  setSegment()
}

cutEndBtn.onclick = function() {
  cutEndTime.value = formatDuration(video.getCurrentTime())
  setSegment()
}

segmentStartBtn.onclick = function() {
  video.seek(parseDuration(cutStartTime.value))
}

segmentEndBtn.onclick = function() {
  video.seek(parseDuration(cutEndTime.value))
}

videoStartBtn.onclick = function() {
  video.seek(0)
}

videoEndBtn.onclick = function() {
  video.seek(video.getDuration())
}

cutStartTime.oninput = cutEndTime.oninput = function onTimeChange() {
  video.seek(parseDuration(this.value))
  setSegment()
}

$('.help').onclick = function() {
  electron.shell.openExternal('https://github.com/seatwork/lossless-cut')
}

document.onkeyup = function(e) {
  e.preventDefault()
  if (video.getDuration() === undefined) return
  if (e.keyCode === 32) return play()   // SPACE
  if (e.keyCode === 37) return video.seek(video.getCurrentTime() - 1)  // LEFT
  if (e.keyCode === 39) return video.seek(video.getCurrentTime() + 1)  // RIGHT
}

/* --------------------------------------------------------
 * Recorder Events
 * ----------------------------------------------------- */

recorder.onstart = function() {
  const outputPath = getGlobal('path').desktop
  recorder.process = ffmpeg.recordVideo(outputPath)
  recorder.process.ontimeupdate = res => recorder.setDuration(res)
  electron.ipcRenderer.send('create-tray')
}

recorder.onstop = function() {
  recorder.process.stdin.write('q')
  electron.ipcRenderer.send('remove-tray')
}

/* --------------------------------------------------------
 * Video Events
 * ----------------------------------------------------- */

video.onloadstart = function() {
  loading(true)
  disableBtns(true)
  if (video.getDuration() == undefined) {
    resetControls()
  }
}

video.onloadedmetadata = function() {
  if (!video.isLoaded) {
    video.isLoaded = true
    openFileBtn.style.opacity = 0
    segment.style.left = 0
    segment.style.right = '100%'
    playBtn.className = 'play'
    duration.innerHTML = cutEndTime.value = formatDuration(video.getDuration())
    showMetadataOnTitle()
  }
}

video.oncanplay = function() {
  loading(false)
  disableBtns(false)
  if (playBtn.className == 'pause') {
    video.play()
  }
}

video.ontimeupdate = function() {
  currentTime.innerHTML = formatDuration(video.getCurrentTime())
  progress.style.left = (video.getCurrentTime() / video.getDuration()) * 100 + '%'
}

video.onended = function() {
  video.pause()
  playBtn.className = 'play'
}

video.onerror = function(e) {
  if (video.isTranscoded) {
    alert('Unsupported video format')
    loading(false)
    disableBtns(true)
    resetControls()
  } else {
    alert('This video needs transcoding, playback will be slower')
    video.transcode()
  }
}

/* --------------------------------------------------------
 * Private Methods
 * ----------------------------------------------------- */

function openFileDialog(multiple = false) {
  return dialog.showOpenDialog({
    properties: ['openFile', multiple ? 'multiSelections' : false],
    filters: [
      { name: 'Media Files', extensions: [
        '3gp', 'asf', 'avi', 'dat', 'flv',
        'mkv', 'mov', 'mp4', 'mpg', 'mpeg', 'ogg', 'rm', 'rmvb', 'vob', 'wmv',
        'aac', 'ape', 'alac', 'flac', 'mp3', 'wav'
      ]},
      { name: 'All Files', extensions: ['*'] }
    ]
  })
}

function setSegment() {
  segment.style.left = (parseDuration(cutStartTime.value) / video.getDuration()) * 100 + '%'
  segment.style.right = (100 - (parseDuration(cutEndTime.value) / video.getDuration()) * 100) + '%'
}

function resetControls() {
  progress.style.left = 0
  openFileBtn.style.opacity = 1
  segment.style.left = 0
  segment.style.right = '100%'
  playBtn.className = 'play'
  duration.innerHTML = '00:00:00.000'
  cutStartTime.value = '00:00:00.000'
  cutEndTime.value = '00:00:00.000'
}

function disableBtns(bool) {
  playBtn.disabled = bool
  videoStartBtn.disabled = bool
  videoEndBtn.disabled = bool
  segmentStartBtn.disabled = bool
  segmentEndBtn.disabled = bool
  cutStartBtn.disabled = bool
  cutEndBtn.disabled = bool
  cutStartTime.disabled = bool
  cutEndTime.disabled = bool
  captureBtn.disabled = bool
  extractBtn.disabled = bool
  cutBtn.disabled = bool
  convertBtn.disabled = bool
}

function showMetadataOnTitle() {
  let format = video.getMetadata('General.Format') || ''
  let frameRate = video.getMetadata('General.FrameRate')
  let bitRate = video.getMetadata('General.OverallBitRate')
  let samplingRate = video.getMetadata('Audio.SamplingRate')

  const metadata = [ format ]
  if (frameRate) metadata.push(parseFloat(frameRate.toFixed(2)) + 'fps')
  if (bitRate)  metadata.push(Math.round(bitRate / 1000) + 'kbps')
  if (samplingRate)  metadata.push(parseFloat((samplingRate / 1000).toFixed(1)) + 'kHz')
  electron.ipcRenderer.send('change-title', metadata.join(', '))
}
