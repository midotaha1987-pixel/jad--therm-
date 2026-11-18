class_name Player
extends CharacterBody3D
## The running hero (Omar green / Yassin blue), built from Godot
## primitives: capsule body, sphere head, hair cap, arms and legs.
## Movement is manual (no physics collisions): the Game moves the
## player forward along -Z, this script handles lanes, jumping
## (double jump), sliding, and the run animation.

signal jumped

const LANE_WIDTH := 2.2
const GRAVITY := 30.0
const JUMP_VELOCITY := 11.0
const MAX_JUMPS := 2
const SLIDE_TIME := 0.7
const LANE_SPEED := 14.0

const HERO_NAMES: Array[String] = ["عمر", "ياسين"]
const HERO_COLORS: Array[Color] = [Color(0.18, 0.68, 0.31), Color(0.18, 0.50, 0.88)]
const SKIN_COLOR := Color(0.96, 0.80, 0.62)
const HAIR_COLOR := Color(0.16, 0.10, 0.06)

var hero := 0
var lane := 1  # 0 = left, 1 = middle, 2 = right
var running := false
var forward_speed := 8.0

var _target_x := 0.0
var _vy := 0.0
var _jumps_used := 0
var _grounded := true
var _sliding := false
var _slide_timer := 0.0
var _invulnerable := false
var _invuln_timer := 0.0
var _anim_time := 0.0

var _visual: Node3D
var _arm_l: Node3D
var _arm_r: Node3D
var _leg_l: Node3D
var _leg_r: Node3D
var _collision: CollisionShape3D
var _name_label: Label3D


func _ready() -> void:
	_collision = $CollisionShape3D
	_name_label = $NameLabel
	_build_character()


func set_hero(new_hero: int) -> void:
	hero = clampi(new_hero, 0, 1)
	if is_node_ready():
		_build_character()


func reset_run() -> void:
	lane = 1
	_target_x = 0.0
	position = Vector3(0.0, 0.0, 0.0)
	_vy = 0.0
	_jumps_used = 0
	_grounded = true
	_sliding = false
	_slide_timer = 0.0
	_invulnerable = false
	_invuln_timer = 0.0
	running = false
	if _visual != null:
		_visual.scale = Vector3.ONE
		_visual.position = Vector3.ZERO
		_visual.rotation = Vector3.ZERO


func move_left() -> void:
	if not running:
		return
	if lane > 0:
		lane -= 1
		_target_x = (float(lane) - 1.0) * LANE_WIDTH


func move_right() -> void:
	if not running:
		return
	if lane < 2:
		lane += 1
		_target_x = (float(lane) - 1.0) * LANE_WIDTH


func jump() -> void:
	if not running:
		return
	if _sliding:
		_end_slide()
	if _jumps_used < MAX_JUMPS:
		_vy = JUMP_VELOCITY
		_jumps_used += 1
		_grounded = false
		AudioManager.play_jump()
		jumped.emit()


func slide() -> void:
	if not running or _sliding:
		return
	_sliding = true
	_slide_timer = SLIDE_TIME
	_visual.scale = Vector3(1.0, 0.55, 1.0)
	_visual.position = Vector3(0.0, -0.32, 0.0)
	_collision.scale = Vector3(1.0, 0.55, 1.0)
	_collision.position = Vector3(0.0, 0.55, 0.0)


func is_sliding() -> bool:
	return _sliding


func is_grounded() -> bool:
	return _grounded


func set_invulnerable(seconds: float) -> void:
	_invulnerable = true
	_invuln_timer = seconds


func is_invulnerable() -> bool:
	return _invulnerable


func _end_slide() -> void:
	_sliding = false
	_visual.scale = Vector3.ONE
	_visual.position = Vector3.ZERO
	_collision.scale = Vector3.ONE
	_collision.position = Vector3(0.0, 0.9, 0.0)


func _physics_process(delta: float) -> void:
	# Lane movement (smooth slide between lanes).
	var dx: float = _target_x - position.x
	var step: float = LANE_SPEED * delta
	if absf(dx) <= step:
		position.x = _target_x
	else:
		position.x += signf(dx) * step

	# Vertical physics: gravity + double jump.
	if not _grounded or _vy != 0.0:
		_vy -= GRAVITY * delta
		position.y += _vy * delta
		if position.y <= 0.0:
			position.y = 0.0
			_vy = 0.0
			_grounded = true
			_jumps_used = 0

	# Slide timer.
	if _sliding:
		_slide_timer -= delta
		if _slide_timer <= 0.0:
			_end_slide()

	# Invulnerability blink.
	if _invulnerable:
		_invuln_timer -= delta
		_visual.visible = int(_invuln_timer * 12.0) % 2 == 0
		if _invuln_timer <= 0.0:
			_invulnerable = false
			_visual.visible = true

	_animate(delta)


func _animate(delta: float) -> void:
	if _visual == null:
		return
	_anim_time += delta * (2.0 + forward_speed * 0.9)
	var swing: float = sin(_anim_time * 3.0) * 0.55
	if running and _grounded and not _sliding:
		_arm_l.rotation.x = swing
		_arm_r.rotation.x = -swing
		_leg_l.rotation.x = -swing
		_leg_r.rotation.x = swing
		_visual.position.y = absf(sin(_anim_time * 3.0)) * 0.06
	elif not _grounded:
		_arm_l.rotation.x = -2.4
		_arm_r.rotation.x = -2.4
		_leg_l.rotation.x = 0.5
		_leg_r.rotation.x = -0.4
	elif _sliding:
		_arm_l.rotation.x = -1.2
		_arm_r.rotation.x = -1.2
		_leg_l.rotation.x = 1.2
		_leg_r.rotation.x = 1.2
	else:
		_arm_l.rotation.x = 0.0
		_arm_r.rotation.x = 0.0
		_leg_l.rotation.x = 0.0
		_leg_r.rotation.x = 0.0
	# Lean into lane changes.
	var lean: float = clampf((_target_x - position.x) * 0.06, -0.25, 0.25)
	_visual.rotation.z = lean


# --- Character construction (primitives only, no photos, no IP) -------------

func _mat(color: Color, metallic := 0.0, roughness := 0.8) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.metallic = metallic
	m.roughness = roughness
	return m


func _part(mesh: Mesh, mat: Material, pos: Vector3, parent: Node3D) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)
	return mi


func _build_character() -> void:
	if _visual != null:
		_visual.queue_free()
	_visual = Node3D.new()
	_visual.name = "Visual"
	add_child(_visual)

	var hero_color: Color = HERO_COLORS[hero]
	var shirt := _mat(hero_color)
	var pants := _mat(Color(0.15, 0.20, 0.45))
	var skin := _mat(SKIN_COLOR)
	var hair := _mat(HAIR_COLOR)
	var shoe := _mat(Color(0.95, 0.95, 0.95))

	# Legs (pivot at hip so they can swing).
	_leg_l = Node3D.new()
	_leg_l.position = Vector3(-0.18, 0.62, 0.0)
	_visual.add_child(_leg_l)
	_leg_r = Node3D.new()
	_leg_r.position = Vector3(0.18, 0.62, 0.0)
	_visual.add_child(_leg_r)
	for leg in [_leg_l, _leg_r]:
		var capsule := CapsuleMesh.new()
		capsule.radius = 0.11
		capsule.height = 0.55
		_part(capsule, pants, Vector3(0.0, -0.28, 0.0), leg)
		var foot := BoxMesh.new()
		foot.size = Vector3(0.2, 0.1, 0.34)
		_part(foot, shoe, Vector3(0.0, -0.58, -0.06), leg)

	# Body.
	var body := CapsuleMesh.new()
	body.radius = 0.42
	body.height = 1.05
	_part(body, shirt, Vector3(0.0, 0.95, 0.0), _visual)

	# Arms (pivot at shoulder).
	_arm_l = Node3D.new()
	_arm_l.position = Vector3(-0.52, 1.32, 0.0)
	_visual.add_child(_arm_l)
	_arm_r = Node3D.new()
	_arm_r.position = Vector3(0.52, 1.32, 0.0)
	_visual.add_child(_arm_r)
	for arm in [_arm_l, _arm_r]:
		var capsule := CapsuleMesh.new()
		capsule.radius = 0.11
		capsule.height = 0.6
		_part(capsule, shirt, Vector3(0.0, -0.28, 0.0), arm)
		var hand := SphereMesh.new()
		hand.radius = 0.12
		hand.height = 0.24
		_part(hand, skin, Vector3(0.0, -0.6, 0.0), arm)

	# Head.
	var head := SphereMesh.new()
	head.radius = 0.42
	head.height = 0.84
	_part(head, skin, Vector3(0.0, 1.78, 0.0), _visual)

	# Hair cap.
	var hair_mesh := SphereMesh.new()
	hair_mesh.radius = 0.44
	hair_mesh.height = 0.88
	var hair_mi := _part(hair_mesh, hair, Vector3(0.0, 1.92, 0.05), _visual)
	hair_mi.scale = Vector3(1.0, 0.62, 1.0)

	# Eyes (front is -Z, the running direction).
	var eye_mat := _mat(Color(0.05, 0.05, 0.05), 0.0, 0.4)
	for ex in [-0.15, 0.15]:
		var eye := SphereMesh.new()
		eye.radius = 0.07
		eye.height = 0.14
		_part(eye, eye_mat, Vector3(ex, 1.82, -0.37), _visual)

	# Hero name floating above.
	_name_label.text = HERO_NAMES[hero]
	_name_label.modulate = Color.WHITE
