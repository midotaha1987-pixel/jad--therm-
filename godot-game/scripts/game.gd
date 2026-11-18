class_name Game
extends Node3D
## Game manager: run state, speed, distance, score, lives, win/lose,
## camera follow, input (keyboard + swipe + on-screen buttons via UI),
## and the bridge back to the main menu (signals).

signal quit_requested
signal next_level_requested(level_number: int)

const MAX_LIVES := 3
const RING_POINTS := 10
const ARCH_POINTS := 50
const BOOST_TIME := 2.5
const BOOST_MULT := 1.5
const BASE_FOV := 70.0
const BOOST_FOV := 84.0

enum State { COUNTDOWN, PLAYING, PAUSED, WON, LOST }

var level_number := 1
var hero := 0
var state: int = State.COUNTDOWN

var _level: Dictionary = {}
var _distance := 0.0
var _score := 0
var _score_frac := 0.0
var _rings := 0
var _lives := MAX_LIVES
var _boost_timer := 0.0
var _countdown := 1.6
var _pit_cooldown := 0.0
var _save: Dictionary = {}

@onready var _player: Player = $Player
@onready var _track: Track = $Track
@onready var _camera: Camera3D = $Camera3D
@onready var _ui: GameUI = $HUD


func _ready() -> void:
	_setup_environment()


func setup(p_level_number: int, p_hero: int, save_data: Dictionary) -> void:
	level_number = p_level_number
	hero = p_hero
	_save = save_data
	_level = Levels.get_level(level_number)
	_distance = 0.0
	_score = 0
	_score_frac = 0.0
	_rings = 0
	_lives = MAX_LIVES
	_boost_timer = 0.0
	_countdown = 1.6
	_pit_cooldown = 0.0
	state = State.COUNTDOWN
	_player.set_hero(hero)
	_player.reset_run()
	_track.build_level(_level)
	_ui.show_panels(false, false, false)
	_ui.set_level(level_number, String(_level.get("name", "")))
	_ui.set_score(0)
	_ui.set_rings(0, int(_level.get("rings", 0)))
	_ui.set_lives(_lives)
	_ui.set_message("استعد…")
	_ui.set_progress(0.0)
	AudioManager.start_music()


func current_speed() -> float:
	var base: float = float(_level.get("speed", 8.0))
	if _boost_timer > 0.0:
		return base * BOOST_MULT
	return base


func _process(delta: float) -> void:
	match state:
		State.COUNTDOWN:
			_countdown -= delta
			if _countdown <= 1.0 and _countdown + delta > 1.0:
				_ui.set_message("انطلق!")
			if _countdown <= 0.0:
				state = State.PLAYING
				_player.running = true
				_ui.set_message("")
		State.PLAYING:
			_tick(delta)
		State.PAUSED, State.WON, State.LOST:
			pass
	_update_camera(delta)


func _tick(delta: float) -> void:
	if _boost_timer > 0.0:
		_boost_timer -= delta
	if _pit_cooldown > 0.0:
		_pit_cooldown -= delta
	var speed: float = current_speed()
	_player.forward_speed = speed
	_player.position.z -= speed * delta
	_distance += speed * delta
	_score_frac += speed * delta
	_score += int(_score_frac)
	_score_frac -= float(int(_score_frac))
	_track.update(_player.position.z)
	_ui.set_score(_score)
	_ui.set_progress(clampf(_distance / float(_level.get("length", 1.0)), 0.0, 1.0))

	for event in _track.check_player(_player):
		_handle_event(event)

	if _distance >= float(_level.get("length", 400.0)):
		_win()
		return
	if _lives <= 0:
		_lose()


func _handle_event(event: Dictionary) -> void:
	match String(event.get("type", "")):
		"ring":
			_rings += 1
			_score += RING_POINTS
			AudioManager.play_ring()
			_ui.set_rings(_rings, int(_level.get("rings", 0)))
			_ui.flash_rings()
		"pad":
			_boost_timer = BOOST_TIME
			AudioManager.play_boost()
			_ui.set_message("دفعة سرعة!")
			_ui.clear_message_after(1.0)
		"arch":
			_score += ARCH_POINTS
			_boost_timer = maxf(_boost_timer, 1.5)
			AudioManager.play_arch()
			_ui.set_message("حلقة ذهبية! +50")
			_ui.clear_message_after(1.2)
		"crash":
			_on_crash()
		"pit":
			_on_pit(float(event.get("z2", 0.0)))


func _on_crash() -> void:
	if _player.is_invulnerable():
		return
	_lives -= 1
	_ui.set_lives(_lives)
	AudioManager.play_crash()
	_player.set_invulnerable(2.0)
	_boost_timer = 0.0
	_ui.set_message("اصطدمت! تبقّى %d" % _lives)
	_ui.clear_message_after(1.0)


func _on_pit(pit_z2: float) -> void:
	if _player.is_invulnerable() or _pit_cooldown > 0.0:
		return
	_lives -= 1
	_ui.set_lives(_lives)
	AudioManager.play_crash()
	# Drop the hero into the pit, then place him just past it.
	_player.position.y = -1.2
	_player.position.z = pit_z2 - 1.5
	_player.set_invulnerable(2.0)
	_pit_cooldown = 2.0
	_ui.set_message("وقعت في الحفرة! تبقّى %d" % _lives)
	_ui.clear_message_after(1.0)


func _win() -> void:
	state = State.WON
	_player.running = false
	var stars: int = Levels.stars_for(_rings, int(_level.get("rings", 0)))
	var tickets: int = Levels.tickets_for(level_number, stars)
	_save = SaveData.record_win(_save, level_number, stars, tickets)
	_save = SaveData.record_score(_save, _score)
	AudioManager.play_win()
	_ui.show_win(stars, tickets, _score, _rings, int(_level.get("rings", 0)), level_number < Levels.COUNT)


func _lose() -> void:
	state = State.LOST
	_player.running = false
	_save = SaveData.record_score(_save, _score)
	AudioManager.play_lose()
	_ui.show_lose(_score)


# --- UI / menu actions (called by GameUI buttons) ---------------------------

func toggle_pause() -> void:
	if state == State.PLAYING:
		state = State.PAUSED
		_player.running = false
		_ui.show_pause(true)
	elif state == State.PAUSED:
		state = State.PLAYING
		_player.running = true
		_ui.show_pause(false)


func retry_level() -> void:
	setup(level_number, hero, _save)


func quit_to_menu() -> void:
	quit_requested.emit()


func request_next_level() -> void:
	if level_number < Levels.COUNT:
		next_level_requested.emit(level_number + 1)


# --- Input: keyboard + swipe -------------------------------------------------

var _touch_start := Vector2.ZERO
var _touching := false


func _unhandled_input(event: InputEvent) -> void:
	if state != State.PLAYING:
		return
	if event.is_action_pressed("move_left"):
		_player.move_left()
		return
	if event.is_action_pressed("move_right"):
		_player.move_right()
		return
	if event.is_action_pressed("jump"):
		_player.jump()
		return
	if event.is_action_pressed("slide"):
		_player.slide()
		return
	if event is InputEventScreenTouch:
		var touch: InputEventScreenTouch = event
		if touch.pressed:
			_touch_start = touch.position
			_touching = true
		elif _touching:
			_touching = false
			_handle_swipe(touch.position - _touch_start)
	elif event is InputEventScreenDrag:
		var drag: InputEventScreenDrag = event
		if _touching and drag.relative.length() > 40.0:
			_touching = false
			_handle_swipe(drag.position - _touch_start)


func _handle_swipe(delta: Vector2) -> void:
	if delta.length() < 50.0:
		return
	if absf(delta.x) > absf(delta.y):
		if delta.x < 0.0:
			_player.move_left()
		else:
			_player.move_right()
	else:
		if delta.y < 0.0:
			_player.jump()
		else:
			_player.slide()


# --- Camera + world ----------------------------------------------------------

func _update_camera(delta: float) -> void:
	var target_fov: float = BOOST_FOV if _boost_timer > 0.0 else BASE_FOV
	_camera.fov = lerpf(_camera.fov, target_fov, delta * 4.0)
	var px: float = _player.position.x * 0.5
	var pz: float = _player.position.z
	var target := Vector3(px, 5.0, pz + 8.0)
	_camera.position = _camera.position.lerp(target, clampf(delta * 8.0, 0.0, 1.0))
	_camera.look_at(Vector3(px, 1.2, pz - 6.0), Vector3.UP)


func _setup_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.25, 0.55, 0.95)
	sky_mat.sky_horizon_color = Color(0.75, 0.90, 1.0)
	sky_mat.ground_bottom_color = Color(0.35, 0.65, 0.35)
	sky_mat.ground_horizon_color = Color(0.75, 0.90, 1.0)
	sky_mat.sun_angle_max = 30.0
	sky_mat.sun_curve = 0.08
	sky.sky_material = sky_mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.9
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color(0.75, 0.88, 1.0)
	env.fog_density = 0.012
	env.fog_sky_affect = 0.5
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	# Sun sphere, far ahead in the sky.
	var sun := MeshInstance3D.new()
	var sun_mesh := SphereMesh.new()
	sun_mesh.radius = 6.0
	sun_mesh.height = 12.0
	sun.mesh = sun_mesh
	var sun_mat := StandardMaterial3D.new()
	sun_mat.albedo_color = Color(1.0, 0.9, 0.4)
	sun_mat.emission_enabled = true
	sun_mat.emission = Color(1.0, 0.85, 0.3)
	sun_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sun.material_override = sun_mat
	sun.position = Vector3(-28.0, 34.0, -160.0)
	add_child(sun)
