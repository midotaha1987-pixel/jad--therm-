class_name Track
extends Node3D
## Endless-feeling track built from reusable 20 m segments spawned
## ahead of the player and freed behind. Each segment holds ground
## (with real pit gaps), trees, houses, clouds, obstacles, golden
## rings, boost pads and — once per level — a giant loop arch.
## Collision is checked analytically in check_player() (lane + z +
## jump height), which keeps the game fast on mobile.

const SEG_LEN := 20.0
const SPAWN_AHEAD := 170.0
const DESPAWN_BEHIND := 45.0
const LANE_X: Array[float] = [-2.2, 0.0, 2.2]

var _level: Dictionary = {}
var _rng := RandomNumberGenerator.new()
var _segments: Dictionary = {}  # seg_index -> Node3D
var _items: Array = []  # dicts: kind, lane, z, z2, node, taken, seg
var _clouds: Array[Node3D] = []
var _next_spawn := 0
var _total_segments := 0
var _arch_seg := -1
var _rings_placed := 0
var _last_row_z := 0.0

var _mats: Dictionary = {}


func _ready() -> void:
	_mats["ground"] = _mat(Color(0.35, 0.78, 0.35))
	_mats["ground_dark"] = _mat(Color(0.30, 0.68, 0.30))
	_mats["shoulder"] = _mat(Color(0.55, 0.85, 0.45))
	_mats["line"] = _mat(Color(1.0, 1.0, 1.0))
	_mats["trunk"] = _mat(Color(0.45, 0.30, 0.15))
	_mats["leaf"] = _mat(Color(0.15, 0.60, 0.25))
	_mats["leaf2"] = _mat(Color(0.25, 0.70, 0.30))
	_mats["cloud"] = _mat(Color(1.0, 1.0, 1.0))
	_mats["gold"] = _mat(Color(1.0, 0.82, 0.15), 0.85, 0.25)
	_mats["gold_emit"] = _mat(Color(1.0, 0.85, 0.2), 0.6, 0.3)
	_mats["low"] = _mat(Color(0.95, 0.35, 0.20))
	_mats["high"] = _mat(Color(0.75, 0.25, 0.65))
	_mats["pad"] = _mat(Color(1.0, 0.55, 0.10), 0.3, 0.4)
	_mats["hole"] = _mat(Color(0.05, 0.05, 0.08))
	_mats["house1"] = _mat(Color(0.98, 0.80, 0.55))
	_mats["house2"] = _mat(Color(0.60, 0.80, 0.98))
	_mats["house3"] = _mat(Color(0.98, 0.65, 0.65))
	_mats["roof"] = _mat(Color(0.80, 0.25, 0.20))
	(_mats["gold_emit"] as StandardMaterial3D).emission_enabled = true
	(_mats["gold_emit"] as StandardMaterial3D).emission = Color(1.0, 0.75, 0.1)
	(_mats["pad"] as StandardMaterial3D).emission_enabled = true
	(_mats["pad"] as StandardMaterial3D).emission = Color(1.0, 0.45, 0.05)


func build_level(level: Dictionary) -> void:
	_level = level
	_rng.seed = int(level.get("number", 1)) * 7919 + 13
	for seg in _segments.values():
		(seg as Node3D).queue_free()
	_segments.clear()
	_items.clear()
	_clouds.clear()
	_next_spawn = 0
	_rings_placed = 0
	_last_row_z = 0.0
	_total_segments = int(ceil(float(level.get("length", 400.0)) / SEG_LEN)) + 2
	_arch_seg = int(_total_segments * 0.6)
	for i in range(9):
		_spawn_segment(i)
	_next_spawn = 9


func update(player_z: float) -> void:
	while -float(_next_spawn) * SEG_LEN > player_z - SPAWN_AHEAD:
		_spawn_segment(_next_spawn)
		_next_spawn += 1
	var to_free: Array = []
	for idx in _segments.keys():
		var z_start: float = -float(idx) * SEG_LEN
		if z_start > player_z + DESPAWN_BEHIND:
			to_free.append(idx)
	for idx in to_free:
		_free_segment(int(idx))


func rings_placed() -> int:
	return _rings_placed


## Checks the player against nearby items. Returns an Array of event
## dictionaries: {"type": "ring"|"pad"|"arch"|"crash"|"pit", ...}
func check_player(player: Player) -> Array:
	var events: Array = []
	var pz: float = player.position.z
	for item in _items:
		if bool(item.get("taken", false)):
			continue
		var z: float = float(item.get("z", 0.0))
		var adz: float = absf(z - pz)
		var kind: String = String(item.get("kind", ""))
		match kind:
			"ring":
				if adz < 1.0 and int(item.get("lane", 1)) == player.lane and player.position.y < 1.8:
					item["taken"] = true
					(item["node"] as Node3D).hide()
					events.append({"type": "ring"})
			"pad":
				if adz < 0.9 and int(item.get("lane", 1)) == player.lane:
					item["taken"] = true
					(item["node"] as Node3D).hide()
					events.append({"type": "pad"})
			"arch":
				if adz < 1.2:
					item["taken"] = true
					events.append({"type": "arch"})
			"low":
				if adz < 0.7 and int(item.get("lane", 1)) == player.lane and player.position.y < 0.9:
					item["taken"] = true
					events.append({"type": "crash", "node": item.get("node")})
			"high":
				if adz < 0.7 and int(item.get("lane", 1)) == player.lane and not player.is_sliding():
					item["taken"] = true
					events.append({"type": "crash", "node": item.get("node")})
			"pit":
				var z2: float = float(item.get("z2", z))
				if int(item.get("lane", 1)) == player.lane and pz <= z and pz >= z2 and player.position.y < 0.6:
					item["taken"] = true
					events.append({"type": "pit", "z2": z2})
	return events


func _process(delta: float) -> void:
	for item in _items:
		if String(item.get("kind", "")) == "ring" and not bool(item.get("taken", false)):
			var node: Node3D = item.get("node", null)
			if is_instance_valid(node):
				node.rotation.y += delta * 3.0
	for c in _clouds:
		if is_instance_valid(c):
			c.position.x += delta * 0.6
			if c.position.x > 24.0:
				c.position.x = -24.0


# --- Segment construction ----------------------------------------------------

func _spawn_segment(seg_index: int) -> void:
	var z_start: float = -float(seg_index) * SEG_LEN
	var seg := Node3D.new()
	seg.name = "Segment%d" % seg_index
	add_child(seg)
	_segments[seg_index] = seg

	var level_rings: int = int(_level.get("rings", 24))
	var allow_pits: bool = bool(_level.get("pits", false))
	var density: float = float(_level.get("density", 0.3))

	# Decide the pit for this segment BEFORE building the ground.
	var pit_lane := -1
	var pit_z_local := -10.0
	if allow_pits and seg_index >= 3 and _rng.randf() < 0.10:
		pit_lane = _rng.randi_range(0, 2)

	_build_ground(seg, z_start, pit_lane, pit_z_local, seg_index)
	_build_scenery(seg, seg_index)

	# Obstacle row (never in the first two segments, never all 3 lanes).
	var row_z_local := 0.0
	var row_lanes: Array[int] = []
	if seg_index >= 2 and _rng.randf() < density:
		row_z_local = _rng.randf_range(-5.0, -15.0)
		var row_z: float = z_start + row_z_local
		if row_z <= _last_row_z - 8.0:
			_last_row_z = row_z
			var lanes: Array[int] = [0, 1, 2]
			lanes.shuffle()
			var count: int = 1 if _rng.randf() < 0.6 else 2
			for i in range(count):
				var ln: int = lanes[i]
				if ln == pit_lane:
					continue
				row_lanes.append(ln)
				var roll: float = _rng.randf()
				if roll < 0.5:
					_add_obstacle(seg, z_start + row_z_local, ln, "low", seg_index)
				else:
					_add_obstacle(seg, z_start + row_z_local, ln, "high", seg_index)

	# Golden rings: a line of up to 3 in one lane.
	if _rings_placed < level_rings and seg_index >= 1:
		var ring_lane: int = _rng.randi_range(0, 2)
		if not row_lanes.is_empty() and ring_lane in row_lanes:
			ring_lane = (ring_lane + 1) % 3
			if ring_lane in row_lanes:
				ring_lane = (ring_lane + 1) % 3
		var to_place: int = mini(3, level_rings - _rings_placed)
		for i in range(to_place):
			var rz: float = z_start - 3.0 - float(i) * 2.0
			_add_ring(seg, rz, ring_lane, seg_index)
			_rings_placed += 1

	# Boost pad.
	if seg_index >= 2 and _rng.randf() < 0.22:
		var pad_lane: int = _rng.randi_range(0, 2)
		_add_pad(seg, z_start - 10.0, pad_lane, seg_index)

	# The one loop arch of the level.
	if seg_index == _arch_seg:
		_add_arch(seg, z_start - 10.0, seg_index)


func _free_segment(seg_index: int) -> void:
	var seg: Node3D = _segments.get(seg_index, null)
	if seg == null:
		return
	_segments.erase(seg_index)
	_items = _items.filter(func(it: Dictionary) -> bool: return int(it.get("seg", -1)) != seg_index)
	_clouds = _clouds.filter(func(c: Node3D) -> bool: return is_instance_valid(c) and c.get_parent() != seg)
	seg.queue_free()


func _build_ground(seg: Node3D, z_start: float, pit_lane: int, pit_z_local: float, seg_index: int) -> void:
	# Three lane strips + two shoulders. A pit splits its lane strip
	# into two boxes with a real 3 m gap and a dark hole visual.
	for lane in range(3):
		var x: float = LANE_X[lane]
		var mat: Material = _mats["ground"] if lane != 1 else _mats["ground_dark"]
		if lane == pit_lane:
			var before_len: float = -pit_z_local - 1.5
			var after_len: float = SEG_LEN - (-pit_z_local + 1.5)
			_box(Vector3(2.4, 1.0, before_len), mat, Vector3(x, -0.5, -before_len / 2.0), seg)
			_box(Vector3(2.4, 1.0, after_len), mat, Vector3(x, -0.5, pit_z_local - 1.5 - after_len / 2.0), seg)
			_box(Vector3(2.4, 0.2, 3.0), _mats["hole"], Vector3(x, -0.6, pit_z_local), seg)
			_items.append({
				"kind": "pit", "lane": lane,
				"z": z_start + pit_z_local + 1.5,
				"z2": z_start + pit_z_local - 1.5,
				"node": null, "taken": false, "seg": seg_index,
			})
		else:
			_box(Vector3(2.4, 1.0, SEG_LEN), mat, Vector3(x, -0.5, -SEG_LEN / 2.0), seg)
	for sx in [-4.1, 4.1]:
		_box(Vector3(1.4, 1.0, SEG_LEN), _mats["shoulder"], Vector3(sx, -0.5, -SEG_LEN / 2.0), seg)
	# Lane divider lines.
	for lx in [-1.1, 1.1]:
		_box(Vector3(0.08, 0.04, SEG_LEN), _mats["line"], Vector3(lx, 0.02, -SEG_LEN / 2.0), seg)


func _build_scenery(seg: Node3D, seg_index: int) -> void:
	# Trees on both sides.
	var tree_count: int = _rng.randi_range(2, 4)
	for i in range(tree_count):
		var side: float = -1.0 if _rng.randf() < 0.5 else 1.0
		var tx: float = side * _rng.randf_range(5.5, 9.0)
		var tz: float = _rng.randf_range(-1.0, -19.0)
		var tree := Node3D.new()
		tree.position = Vector3(tx, 0.0, tz)
		seg.add_child(tree)
		var trunk := CylinderMesh.new()
		trunk.top_radius = 0.16
		trunk.bottom_radius = 0.22
		trunk.height = 1.4
		trunk.radial_segments = 8
		_part(trunk, _mats["trunk"], Vector3(0.0, 0.7, 0.0), tree)
		var leaves := SphereMesh.new()
		leaves.radius = _rng.randf_range(0.8, 1.2)
		leaves.height = leaves.radius * 2.0
		var leaf_mat: Material = _mats["leaf"] if _rng.randf() < 0.5 else _mats["leaf2"]
		_part(leaves, leaf_mat, Vector3(0.0, 2.0, 0.0), tree)

	# A house every third segment, far to one side.
	if seg_index % 3 == 1:
		var side: float = -1.0 if seg_index % 2 == 0 else 1.0
		var hx: float = side * _rng.randf_range(11.0, 14.0)
		var house := Node3D.new()
		house.position = Vector3(hx, 0.0, -10.0)
		seg.add_child(house)
		var house_mat: Material = [_mats["house1"], _mats["house2"], _mats["house3"]][_rng.randi_range(0, 2)]
		_box(Vector3(3.2, 2.6, 3.0), house_mat, Vector3(0.0, 1.3, 0.0), house)
		var roof := CylinderMesh.new()
		roof.top_radius = 0.0
		roof.bottom_radius = 2.6
		roof.height = 1.5
		roof.radial_segments = 4
		var roof_mi := _part(roof, _mats["roof"], Vector3(0.0, 3.35, 0.0), house)
		roof_mi.rotation.y = PI / 4.0

	# A drifting cloud now and then.
	if _rng.randf() < 0.6:
		var cloud := Node3D.new()
		cloud.position = Vector3(_rng.randf_range(-14.0, 14.0), _rng.randf_range(12.0, 17.0), _rng.randf_range(-2.0, -18.0))
		seg.add_child(cloud)
		for j in range(3):
			var puff := SphereMesh.new()
			puff.radius = _rng.randf_range(0.9, 1.4)
			puff.height = puff.radius * 2.0
			var mi := _part(puff, _mats["cloud"], Vector3(float(j - 1) * 1.3, _rng.randf_range(-0.2, 0.3), 0.0), cloud)
			mi.scale = Vector3(1.0, 0.55, 1.0)
		_clouds.append(cloud)


func _add_obstacle(seg: Node3D, z: float, lane: int, kind: String, seg_index: int) -> void:
	var x: float = LANE_X[lane]
	var node := Node3D.new()
	node.position = Vector3(x, 0.0, z - (-float(seg_index) * SEG_LEN))
	seg.add_child(node)
	if kind == "low":
		# Low barrier: jump over it (top at y = 1.0).
		_box(Vector3(2.0, 1.0, 0.4), _mats["low"], Vector3(0.0, 0.5, 0.0), node)
		_box(Vector3(2.0, 0.18, 0.46), _mats["line"], Vector3(0.0, 1.0, 0.0), node)
	else:
		# High barrier: a hanging beam with a gap underneath — slide under it.
		_box(Vector3(2.0, 0.5, 0.4), _mats["high"], Vector3(0.0, 2.1, 0.0), node)
		_box(Vector3(0.18, 1.4, 0.4), _mats["high"], Vector3(-0.91, 1.4, 0.0), node)
		_box(Vector3(0.18, 1.4, 0.4), _mats["high"], Vector3(0.91, 1.4, 0.0), node)
		_box(Vector3(2.0, 0.18, 0.46), _mats["line"], Vector3(0.0, 1.35, 0.0), node)
	_items.append({"kind": kind, "lane": lane, "z": z, "node": node, "taken": false, "seg": seg_index})


func _add_ring(seg: Node3D, z: float, lane: int, seg_index: int) -> void:
	var pivot := Node3D.new()
	var seg_z: float = -float(seg_index) * SEG_LEN
	pivot.position = Vector3(LANE_X[lane], 1.2, z - seg_z)
	seg.add_child(pivot)
	var torus := TorusMesh.new()
	torus.inner_radius = 0.55
	torus.outer_radius = 0.85
	torus.rings = 24
	torus.ring_segments = 12
	var mi := _part(torus, _mats["gold_emit"], Vector3.ZERO, pivot)
	mi.rotation.x = PI / 2.0
	_items.append({"kind": "ring", "lane": lane, "z": z, "node": pivot, "taken": false, "seg": seg_index})


func _add_pad(seg: Node3D, z: float, lane: int, seg_index: int) -> void:
	var seg_z: float = -float(seg_index) * SEG_LEN
	var node := Node3D.new()
	node.position = Vector3(LANE_X[lane], 0.06, z - seg_z)
	seg.add_child(node)
	_box(Vector3(2.0, 0.1, 2.0), _mats["pad"], Vector3.ZERO, node)
	_items.append({"kind": "pad", "lane": lane, "z": z, "node": node, "taken": false, "seg": seg_index})


func _add_arch(seg: Node3D, z: float, seg_index: int) -> void:
	var seg_z: float = -float(seg_index) * SEG_LEN
	var node := Node3D.new()
	node.position = Vector3(0.0, 3.4, z - seg_z)
	seg.add_child(node)
	var torus := TorusMesh.new()
	torus.inner_radius = 3.3
	torus.outer_radius = 4.0
	torus.rings = 32
	torus.ring_segments = 12
	var mi := _part(torus, _mats["gold"], Vector3.ZERO, node)
	mi.rotation.x = PI / 2.0
	_items.append({"kind": "arch", "lane": 1, "z": z, "node": node, "taken": false, "seg": seg_index})


# --- Small mesh helpers ------------------------------------------------------

func _mat(color: Color, metallic := 0.0, roughness := 0.85) -> StandardMaterial3D:
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


func _box(size: Vector3, mat: Material, pos: Vector3, parent: Node3D) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	return _part(mesh, mat, pos, parent)
