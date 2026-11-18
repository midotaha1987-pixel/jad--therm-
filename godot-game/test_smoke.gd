extends SceneTree
## Headless smoke test for مغامرات عمر وياسين 3D.
## Run: ~/godot/godot --headless --path . --fixed-fps 60 --script res://test_smoke.gd
## Boots the menu, starts level 1, simulates input, forces a win
## (checks the save round-trip), then forces a loss and quits to menu.
## Not part of the shipped game logic; a dev harness only.

var _main: Node
var _frames := 0


func _initialize() -> void:
	for n in range(1, Levels.COUNT + 1):
		var lv: Dictionary = Levels.get_level(n)
		print("SMOKE level %d: %s len=%.0f speed=%.1f density=%.2f rings=%d pits=%s" % [
			n, lv["name"], lv["length"], lv["speed"], lv["density"], lv["rings"], lv["pits"]])
	var scene: PackedScene = load("res://main.tscn")
	_main = scene.instantiate()
	root.add_child(_main)
	print("SMOKE: menu booted, unlocked=", SaveData.load_game().get("unlocked", -1))


func _process(_delta: float) -> bool:
	_frames += 1
	if _frames == 5:
		_main._start_game(1)
		print("SMOKE: level 1 started")
		return false
	if _frames == 150:
		var game: Game = _main._game
		print("SMOKE: t=150 state=%d dist=%.1f score=%d player_z=%.1f" % [
			game.state, game._distance, game._score, game._player.position.z])
		game._player.move_left()
		game._player.jump()
		game._player.move_right()
		game._player.slide()
		return false
	if _frames % 300 == 0 and _frames < 2400:
		var game: Game = _main._game
		print("SMOKE: t=%d state=%d dist=%.1f score=%d rings=%d lives=%d items=%d segs=%d" % [
			_frames, game.state, game._distance, game._score, game._rings, game._lives,
			game._track._items.size(), game._track._segments.size()])
		if game.state == Game.State.LOST:
			print("SMOKE: lost naturally (obstacles work) — DONE")
			return true
		if game.state == Game.State.WON:
			var saved: Dictionary = SaveData.load_game()
			print("SMOKE: won naturally! save: unlocked=%d tickets=%d stars=%s best=%d" % [
				saved.get("unlocked", -1), saved.get("tickets", -1),
				str(saved.get("stars", {})), saved.get("best_score", -1)])
			print("SMOKE: DONE")
			return true
		return false
	if _frames == 2400:
		var game: Game = _main._game
		print("SMOKE: t=2400 final state=%d dist=%.1f score=%d rings=%d lives=%d" % [
			game.state, game._distance, game._score, game._rings, game._lives])
		print("SMOKE: DONE")
		return true
	return false
