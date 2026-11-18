extends Node
## Procedural sound + music for مغامرات عمر وياسين 3D.
## No external audio files: every sound is synthesised into an
## AudioStreamWAV (16-bit mono) at startup, and the background music
## is a cheerful pentatonic loop rendered the same way.
## Autoloaded as "AudioManager" (see project.godot).

const MIX_RATE := 22050

var _music_player: AudioStreamPlayer
var _sfx_players: Array[AudioStreamPlayer] = []
var _streams: Dictionary = {}
var music_enabled := true


func _ready() -> void:
	_music_player = AudioStreamPlayer.new()
	_music_player.volume_db = -14.0
	add_child(_music_player)
	for i in range(6):
		var p := AudioStreamPlayer.new()
		add_child(p)
		_sfx_players.append(p)
	_streams["ring"] = _make_arpeggio([1318.5, 1760.0], 0.11, 0.55)
	_streams["jump"] = _make_sweep(320.0, 940.0, 0.22, 0.5)
	_streams["crash"] = _make_noise(0.35, 0.6)
	_streams["win"] = _make_arpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.15, 0.55)
	_streams["click"] = _make_tone(880.0, 0.07, 0.4)
	_streams["boost"] = _make_sweep(420.0, 1500.0, 0.35, 0.5)
	_streams["arch"] = _make_arpeggio([659.25, 783.99, 1046.5], 0.12, 0.55)
	_streams["lose"] = _make_arpeggio([392.0, 329.63, 261.63], 0.22, 0.5)
	_music_player.stream = _make_music_loop()
	if music_enabled:
		_music_player.play()


func start_music() -> void:
	if music_enabled and not _music_player.playing:
		_music_player.play()


func stop_music() -> void:
	_music_player.stop()


func set_music_enabled(enabled: bool) -> void:
	music_enabled = enabled
	if enabled:
		start_music()
	else:
		stop_music()


func play_ring() -> void:
	_play_sfx("ring")


func play_jump() -> void:
	_play_sfx("jump")


func play_crash() -> void:
	_play_sfx("crash")


func play_win() -> void:
	_play_sfx("win")


func play_lose() -> void:
	_play_sfx("lose")


func play_click() -> void:
	_play_sfx("click")


func play_boost() -> void:
	_play_sfx("boost")


func play_arch() -> void:
	_play_sfx("arch")


func _play_sfx(stream_name: String) -> void:
	var stream: AudioStreamWAV = _streams.get(stream_name, null)
	if stream == null:
		return
	for p in _sfx_players:
		if not p.playing:
			p.stream = stream
			p.play()
			return
	_sfx_players[0].stream = stream
	_sfx_players[0].play()


# --- Synthesis helpers -------------------------------------------------------

func _pack(samples: PackedFloat32Array) -> AudioStreamWAV:
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = MIX_RATE
	wav.stereo = false
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in range(samples.size()):
		var v: float = clampf(samples[i], -1.0, 1.0)
		bytes.encode_s16(i * 2, int(v * 32767.0))
	wav.data = bytes
	return wav


## Sine tone with a fast attack and exponential decay envelope.
func _make_tone(freq: float, duration: float, volume: float) -> AudioStreamWAV:
	var count := int(MIX_RATE * duration)
	var samples := PackedFloat32Array()
	samples.resize(count)
	for i in range(count):
		var t: float = float(i) / MIX_RATE
		var env: float = minf(1.0, t / 0.008) * exp(-3.0 * t / duration)
		samples[i] = sin(TAU * freq * t) * volume * env
	return _pack(samples)


## Frequency sweep (whoosh / boost), sine with a touch of noise.
func _make_sweep(freq_from: float, freq_to: float, duration: float, volume: float) -> AudioStreamWAV:
	var count := int(MIX_RATE * duration)
	var samples := PackedFloat32Array()
	samples.resize(count)
	var phase := 0.0
	for i in range(count):
		var t: float = float(i) / MIX_RATE
		var frac: float = t / duration
		var freq: float = lerpf(freq_from, freq_to, frac)
		phase += TAU * freq / MIX_RATE
		var env: float = sin(PI * frac)
		samples[i] = sin(phase) * volume * env
	return _pack(samples)


## Filtered noise burst (crash / thud).
func _make_noise(duration: float, volume: float) -> AudioStreamWAV:
	var count := int(MIX_RATE * duration)
	var samples := PackedFloat32Array()
	samples.resize(count)
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	var last := 0.0
	for i in range(count):
		var t: float = float(i) / MIX_RATE
		var white: float = rng.randf_range(-1.0, 1.0)
		last = last * 0.72 + white * 0.28
		var env: float = exp(-6.0 * t / duration)
		samples[i] = last * volume * env * 2.0
	return _pack(samples)


## Short sequence of notes, one after another.
func _make_arpeggio(freqs: Array, note_duration: float, volume: float) -> AudioStreamWAV:
	var samples := PackedFloat32Array()
	var per_note := int(MIX_RATE * note_duration)
	for f in freqs:
		for i in range(per_note):
			var t: float = float(i) / MIX_RATE
			var env: float = minf(1.0, t / 0.008) * exp(-2.5 * t / note_duration)
			samples.append(sin(TAU * float(f) * t) * volume * env)
	return _pack(samples)


## Cheerful pentatonic melody loop (~7.3 s, loops seamlessly).
## Melody in C major pentatonic + a simple bass line.
func _make_music_loop() -> AudioStreamWAV:
	var bpm := 132.0
	var eighth: float = 60.0 / bpm / 2.0
	var melody: Array = [
		659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 659.25, 523.25,
		587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25,
		659.25, 783.99, 880.0, 783.99, 880.0, 783.99, 659.25, 587.33,
		523.25, 587.33, 659.25, 0.0, 587.33, 523.25, 587.33, 0.0,
	]
	var bass: Array = [130.81, 98.0, 110.0, 87.31, 130.81, 98.0, 87.31, 98.0]
	var total: float = float(melody.size()) * eighth
	var count := int(MIX_RATE * total)
	var samples := PackedFloat32Array()
	samples.resize(count)
	for i in range(count):
		var t: float = float(i) / MIX_RATE
		var note_index: int = int(t / eighth)
		var note_t: float = t - float(note_index) * eighth
		var value := 0.0
		var mf: float = float(melody[note_index])
		if mf > 0.0:
			var env: float = exp(-2.2 * note_t / eighth)
			value += sin(TAU * mf * note_t) * 0.42 * env
			value += sin(TAU * mf * 2.0 * note_t) * 0.10 * env
		var bass_index: int = int(t / (eighth * 2.0)) % bass.size()
		var bass_t: float = fmod(t, eighth * 2.0)
		var bf: float = float(bass[bass_index])
		var benv: float = exp(-1.4 * bass_t / (eighth * 2.0))
		value += sin(TAU * bf * bass_t) * 0.30 * benv
		# Gentle fade at the very end so the loop point is click-free.
		var fade: float = clampf((total - t) / 0.05, 0.0, 1.0)
		samples[i] = value * fade
	var wav := _pack(samples)
	wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
	wav.loop_begin = 0
	wav.loop_end = count
	return wav
