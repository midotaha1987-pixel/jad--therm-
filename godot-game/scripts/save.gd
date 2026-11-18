class_name SaveData
## Save / load of player progress to user://save.cfg.
## Stored data:
##   unlocked   : highest unlocked level (1..12)
##   tickets    : total tickets earned (currency)
##   best_score : best score across all runs
##   hero       : 0 = Omar, 1 = Yassin
##   stars      : Dictionary { "1": 3, "2": 2, ... } stars per level

const SAVE_PATH := "user://save.cfg"


static func default_data() -> Dictionary:
	return {
		"unlocked": 1,
		"tickets": 0,
		"best_score": 0,
		"hero": 0,
		"stars": {},
	}


static func load_game() -> Dictionary:
	var data: Dictionary = default_data()
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return data
	data["unlocked"] = clampi(int(cfg.get_value("progress", "unlocked", 1)), 1, Levels.COUNT)
	data["tickets"] = maxi(int(cfg.get_value("progress", "tickets", 0)), 0)
	data["best_score"] = maxi(int(cfg.get_value("progress", "best_score", 0)), 0)
	data["hero"] = clampi(int(cfg.get_value("progress", "hero", 0)), 0, 1)
	var stars: Dictionary = cfg.get_value("progress", "stars", {})
	data["stars"] = stars
	return data


static func save_game(data: Dictionary) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("progress", "unlocked", int(data.get("unlocked", 1)))
	cfg.set_value("progress", "tickets", int(data.get("tickets", 0)))
	cfg.set_value("progress", "best_score", int(data.get("best_score", 0)))
	cfg.set_value("progress", "hero", int(data.get("hero", 0)))
	cfg.set_value("progress", "stars", data.get("stars", {}))
	cfg.save(SAVE_PATH)


static func stars_for(data: Dictionary, level_number: int) -> int:
	var stars: Dictionary = data.get("stars", {})
	return int(stars.get(str(level_number), 0))


## Record a level win: keep best stars, unlock the next level, add tickets.
static func record_win(data: Dictionary, level_number: int, stars: int, tickets: int) -> Dictionary:
	var star_map: Dictionary = data.get("stars", {})
	var key := str(level_number)
	var best: int = int(star_map.get(key, 0))
	if stars > best:
		star_map[key] = stars
	data["stars"] = star_map
	data["unlocked"] = clampi(maxi(int(data.get("unlocked", 1)), level_number + 1), 1, Levels.COUNT)
	data["tickets"] = int(data.get("tickets", 0)) + tickets
	save_game(data)
	return data


static func record_score(data: Dictionary, score: int) -> Dictionary:
	if score > int(data.get("best_score", 0)):
		data["best_score"] = score
		save_game(data)
	return data
