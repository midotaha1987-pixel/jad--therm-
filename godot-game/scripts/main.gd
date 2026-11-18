extends Node
## Main menu: hero select (Omar / Yassin), level select (12 levels with
## locked / unlocked / completed states), tickets display, and launching
## the Game scene. Progress is saved with SaveData (user://save.cfg).

const GAME_SCENE := preload("res://game.tscn")
const HERO_NAMES: Array[String] = ["عمر", "ياسين"]
const HERO_COLORS: Array[Color] = [Color(0.18, 0.68, 0.31), Color(0.18, 0.50, 0.88)]

var _save: Dictionary = {}
var _selected_hero := 0
var _selected_level := 1
var _game: Game = null

var _menu: Control
var _hero_buttons: Array[Button] = []
var _level_buttons: Array[Button] = []
var _tickets_label: Label
var _best_label: Label
var _play_button: Button


func _ready() -> void:
	_save = SaveData.load_game()
	_selected_hero = int(_save.get("hero", 0))
	_selected_level = clampi(int(_save.get("unlocked", 1)), 1, Levels.COUNT)
	_menu = $Menu
	_build_menu()
	_refresh_all()
	AudioManager.start_music()


func _build_menu() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.55, 0.85, 0.98)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	_menu.add_child(bg)

	var vbox := VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	vbox.offset_left = 36.0
	vbox.offset_top = 48.0
	vbox.offset_right = -36.0
	vbox.offset_bottom = -40.0
	vbox.add_theme_constant_override("separation", 16)
	vbox.alignment = BoxContainer.ALIGNMENT_BEGIN
	_menu.add_child(vbox)

	var title := _label("مغامرات عمر وياسين", 52, true)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(title)
	var title3d := _label("3D", 40, true)
	title3d.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(title3d)
	var subtitle := _label("لعبة جري ثلاثية الأبعاد — اجمع الخواتم الذهبية واعبر الحلقات!", 24, false)
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(subtitle)

	var hero_label := _label("اختار بطلك:", 28, true)
	hero_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(hero_label)
	var hero_row := HBoxContainer.new()
	hero_row.alignment = BoxContainer.ALIGNMENT_CENTER
	hero_row.add_theme_constant_override("separation", 24)
	vbox.add_child(hero_row)
	for i in range(2):
		var b := Button.new()
		b.text = HERO_NAMES[i]
		b.custom_minimum_size = Vector2(220, 84)
		b.add_theme_font_size_override("font_size", 34)
		b.pressed.connect(_on_hero_pressed.bind(i))
		hero_row.add_child(b)
		_hero_buttons.append(b)

	var level_label := _label("اختار المرحلة:", 28, true)
	level_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(level_label)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 16)
	var grid_center := HBoxContainer.new()
	grid_center.alignment = BoxContainer.ALIGNMENT_CENTER
	grid_center.add_child(grid)
	vbox.add_child(grid_center)
	for n in range(1, Levels.COUNT + 1):
		var b := Button.new()
		b.text = str(n)
		b.custom_minimum_size = Vector2(120, 76)
		b.add_theme_font_size_override("font_size", 32)
		b.pressed.connect(_on_level_pressed.bind(n))
		grid.add_child(b)
		_level_buttons.append(b)

	_play_button = Button.new()
	_play_button.text = "العب الآن!"
	_play_button.custom_minimum_size = Vector2(320, 92)
	_play_button.add_theme_font_size_override("font_size", 38)
	_play_button.pressed.connect(_on_play_pressed)
	var play_center := HBoxContainer.new()
	play_center.alignment = BoxContainer.ALIGNMENT_CENTER
	play_center.add_child(_play_button)
	vbox.add_child(play_center)

	_tickets_label = _label("", 26, false)
	_tickets_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(_tickets_label)
	_best_label = _label("", 24, false)
	_best_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(_best_label)

	var how := _label("طريقة اللعب: اسحب يمين / يسار أو استخدم الأسهم للتبديل بين المسارات • اسحب لأعلى أو اضغط مسافة للقفز (قفزتان) • اسحب لأسفل للانزلاق تحت الحواجز العالية • اقفز فوق الحفر!", 22, false)
	how.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	how.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(how)

	var credit := _label("صُنعت بحب لعمر وياسين", 20, false)
	credit.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(credit)


func _label(text: String, size: int, bold: bool) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	if bold:
		l.add_theme_font_override("font", load("res://assets/fonts/NotoSansArabic-Bold.ttf") as Font)
	return l


func _refresh_all() -> void:
	_refresh_hero_buttons()
	_refresh_level_buttons()
	_tickets_label.text = "التذاكر: %d" % int(_save.get("tickets", 0))
	_best_label.text = "أفضل نتيجة: %d" % int(_save.get("best_score", 0))


func _refresh_hero_buttons() -> void:
	for i in range(_hero_buttons.size()):
		var b: Button = _hero_buttons[i]
		var style := StyleBoxFlat.new()
		style.bg_color = HERO_COLORS[i] if i == _selected_hero else Color(0.85, 0.85, 0.85)
		style.corner_radius_top_left = 14
		style.corner_radius_top_right = 14
		style.corner_radius_bottom_left = 14
		style.corner_radius_bottom_right = 14
		style.content_margin_left = 12.0
		style.content_margin_right = 12.0
		b.add_theme_stylebox_override("normal", style)
		b.add_theme_color_override("font_color", Color.WHITE if i == _selected_hero else Color(0.15, 0.15, 0.15))


func _refresh_level_buttons() -> void:
	var unlocked: int = int(_save.get("unlocked", 1))
	for n in range(1, Levels.COUNT + 1):
		var b: Button = _level_buttons[n - 1]
		var stars: int = SaveData.stars_for(_save, n)
		if n > unlocked:
			b.disabled = true
			b.text = "%d (مغلقة)" % n
			b.add_theme_font_size_override("font_size", 22)
		else:
			b.disabled = false
			b.add_theme_font_size_override("font_size", 32)
			if stars > 0:
				b.text = "%d (%d نجوم)" % [n, stars]
				b.add_theme_font_size_override("font_size", 22)
			else:
				b.text = str(n)
		var style := StyleBoxFlat.new()
		if n == _selected_level:
			style.bg_color = Color(1.0, 0.85, 0.2)
		elif stars > 0:
			style.bg_color = Color(0.55, 0.85, 0.55)
		elif n <= unlocked:
			style.bg_color = Color(0.75, 0.88, 1.0)
		else:
			style.bg_color = Color(0.80, 0.80, 0.80)
		style.corner_radius_top_left = 12
		style.corner_radius_top_right = 12
		style.corner_radius_bottom_left = 12
		style.corner_radius_bottom_right = 12
		b.add_theme_stylebox_override("normal", style)


# --- Signals -------------------------------------------------------------------

func _on_hero_pressed(hero: int) -> void:
	_selected_hero = hero
	_save["hero"] = hero
	SaveData.save_game(_save)
	AudioManager.play_click()
	_refresh_hero_buttons()


func _on_level_pressed(level_number: int) -> void:
	_selected_level = level_number
	AudioManager.play_click()
	_refresh_level_buttons()


func _on_play_pressed() -> void:
	AudioManager.play_click()
	_start_game(_selected_level)


func _start_game(level_number: int) -> void:
	if _game != null:
		_game.queue_free()
	_game = GAME_SCENE.instantiate() as Game
	add_child(_game)
	_game.quit_requested.connect(_on_game_quit)
	_game.next_level_requested.connect(_on_next_level)
	_menu.visible = false
	_game.setup(level_number, _selected_hero, _save)


func _on_game_quit() -> void:
	if _game != null:
		_game.queue_free()
		_game = null
	_save = SaveData.load_game()
	_menu.visible = true
	_refresh_all()


func _on_next_level(level_number: int) -> void:
	if _game != null:
		_game.queue_free()
		_game = null
	_save = SaveData.load_game()
	_selected_level = level_number
	_start_game(level_number)
