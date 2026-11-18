class_name Levels
## Static level definitions for مغامرات عمر وياسين 3D.
## 12 levels, easy -> hard. Each level defines:
##   length  : track length in meters
##   speed   : base run speed (m/s)
##   density : probability a segment holds an obstacle row (0..1)
##   rings   : total golden rings placed in the level
##   pits    : whether pit gaps may appear (from level 3)

const COUNT := 12

const NAMES: Array[String] = [
	"الغابة الخضراء",
	"حديقة الزهور",
	"النهر الأزرق",
	"القرية الجميلة",
	"تلة الفراشات",
	"الصحراء الذهبية",
	"جبل الثلج",
	"السوق القديم",
	"المدينة المضيئة",
	"قصر الألعاب",
	"بركان النجوم",
	"قمة المغامرة",
]


static func get_level(n: int) -> Dictionary:
	var num: int = clampi(n, 1, COUNT)
	var length: float = 380.0 + float(num - 1) * 110.0
	var speed: float = 8.0 + float(num - 1) * 0.9
	var density: float = minf(0.28 + float(num - 1) * 0.035, 0.62)
	var rings: int = 24 + num * 2
	return {
		"number": num,
		"name": NAMES[num - 1],
		"length": length,
		"speed": speed,
		"density": density,
		"rings": rings,
		"pits": num >= 3,
	}


static func all_levels() -> Array:
	var out: Array = []
	for i in range(1, COUNT + 1):
		out.append(get_level(i))
	return out


## Stars earned from the share of rings collected on a win.
static func stars_for(rings_collected: int, rings_total: int) -> int:
	if rings_total <= 0:
		return 1
	var ratio: float = float(rings_collected) / float(rings_total)
	if ratio >= 0.9:
		return 3
	if ratio >= 0.6:
		return 2
	return 1


## Tickets earned for finishing a level: stars + level number.
static func tickets_for(level_number: int, stars: int) -> int:
	return stars + level_number
