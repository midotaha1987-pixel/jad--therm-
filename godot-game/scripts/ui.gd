class_name GameUI
extends CanvasLayer
## HUD + pause / win / lose panels for the runner.
## Node paths must match hud.tscn. Buttons call the parent Game.

var _game: Game
var _message_timer := 0.0

@onready var _score_label: Label = $HUD/TopBar/ScoreLabel
@onready var _rings_label: Label = $HUD/TopBar/RingsLabel
@onready var _lives_label: Label = $HUD/TopBar/LivesLabel
@onready var _level_label: Label = $HUD/TopBar/LevelLabel
@onready var _progress_bar: ProgressBar = $HUD/TopBar/ProgressBar
@onready var _message_label: Label = $HUD/MessageLabel
@onready var _pause_panel: PanelContainer = $HUD/PausePanel
@onready var _win_panel: PanelContainer = $HUD/WinPanel
@onready var _lose_panel: PanelContainer = $HUD/LosePanel


func _ready() -> void:
	_game = get_parent() as Game
	($HUD as Control).layout_direction = Control.LAYOUT_DIRECTION_RTL
	($HUD/TouchControls/LeftButton as Button).pressed.connect(_on_left)
	($HUD/TouchControls/RightButton as Button).pressed.connect(_on_right)
	($HUD/TouchControls/JumpButton as Button).pressed.connect(_on_jump)
	($HUD/TouchControls/SlideButton as Button).pressed.connect(_on_slide)
	($HUD/TopBar/PauseButton as Button).pressed.connect(_on_pause)
	($HUD/PausePanel/VBox/ResumeButton as Button).pressed.connect(_on_resume)
	($HUD/PausePanel/VBox/RestartButton as Button).pressed.connect(_on_restart)
	($HUD/PausePanel/VBox/MenuButton as Button).pressed.connect(_on_menu)
	($HUD/WinPanel/VBox/NextButton as Button).pressed.connect(_on_next)
	($HUD/WinPanel/VBox/ReplayButton as Button).pressed.connect(_on_restart)
	($HUD/WinPanel/VBox/WinMenuButton as Button).pressed.connect(_on_menu)
	($HUD/LosePanel/VBox/RetryButton as Button).pressed.connect(_on_restart)
	($HUD/LosePanel/VBox/LoseMenuButton as Button).pressed.connect(_on_menu)


func _process(delta: float) -> void:
	if _message_timer > 0.0:
		_message_timer -= delta
		if _message_timer <= 0.0:
			_message_label.text = ""


# --- HUD updates ---------------------------------------------------------------

func set_score(score: int) -> void:
	_score_label.text = "النقاط: %d" % score


func set_rings(collected: int, total: int) -> void:
	_rings_label.text = "الخواتم: %d / %d" % [collected, total]


func flash_rings() -> void:
	_rings_label.modulate = Color(1.0, 0.85, 0.2)
	var tween := create_tween()
	tween.tween_property(_rings_label, "modulate", Color.WHITE, 0.4)


func set_lives(lives: int) -> void:
	_lives_label.text = "الأرواح: %d" % lives


func set_level(level_number: int, level_name: String) -> void:
	_level_label.text = "المرحلة %d: %s" % [level_number, level_name]


func set_progress(frac: float) -> void:
	_progress_bar.value = clampf(frac, 0.0, 1.0) * 100.0


func set_message(text: String) -> void:
	_message_label.text = text
	_message_timer = 0.0


func clear_message_after(seconds: float) -> void:
	_message_timer = seconds


# --- Panels --------------------------------------------------------------------

func show_panels(show_pause: bool, show_win: bool, show_lose: bool) -> void:
	_pause_panel.visible = show_pause
	_win_panel.visible = show_win
	_lose_panel.visible = show_lose


func show_pause(show: bool) -> void:
	_pause_panel.visible = show


func show_win(stars: int, tickets: int, score: int, rings: int, rings_total: int, has_next: bool) -> void:
	($HUD/WinPanel/VBox/TitleLabel as Label).text = "مبروك! فزت بالمرحلة"
	($HUD/WinPanel/VBox/StarsLabel as Label).text = "النجوم: %d من 3" % stars
	($HUD/WinPanel/VBox/TicketsLabel as Label).text = "التذاكر: +%d" % tickets
	($HUD/WinPanel/VBox/ScoreLabel as Label).text = "النقاط: %d  •  الخواتم: %d / %d" % [score, rings, rings_total]
	($HUD/WinPanel/VBox/NextButton as Button).visible = has_next
	_win_panel.visible = true


func show_lose(score: int) -> void:
	($HUD/LosePanel/VBox/ScoreLabel as Label).text = "النقاط: %d" % score
	_lose_panel.visible = true


# --- Button handlers -----------------------------------------------------------

func _on_left() -> void:
	_game._player.move_left()


func _on_right() -> void:
	_game._player.move_right()


func _on_jump() -> void:
	_game._player.jump()


func _on_slide() -> void:
	_game._player.slide()


func _on_pause() -> void:
	AudioManager.play_click()
	_game.toggle_pause()


func _on_resume() -> void:
	AudioManager.play_click()
	_game.toggle_pause()


func _on_restart() -> void:
	AudioManager.play_click()
	show_panels(false, false, false)
	_game.retry_level()


func _on_menu() -> void:
	AudioManager.play_click()
	_game.quit_to_menu()


func _on_next() -> void:
	AudioManager.play_click()
	_game.request_next_level()
