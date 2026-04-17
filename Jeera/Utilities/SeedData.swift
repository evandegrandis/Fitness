import Foundation
import SwiftData

struct SeedData {
    static func seed(context: ModelContext) {
        let settings = UserSettings()
        context.insert(settings)

        let exercises = createExercises(context: context)
        createGoals(context: context)
        createTemplates(context: context, exercises: exercises)
        createRealHistory(context: context, exercises: exercises)

        try? context.save()
    }

    // MARK: - Exercises

    static func createExercises(context: ModelContext) -> [String: Exercise] {
        var map: [String: Exercise] = [:]

        func make(
            _ name: String,
            category: String,
            mode: SetPatternMode = .straight,
            repMin: Int = 8,
            repMax: Int = 12,
            increment: Double = 2.5,
            rest: Int = 120,
            favorite: Bool = false,
            machine: String = "",
            notes: String = "",
            benchmarkLow: Double? = nil,
            benchmarkHigh: Double? = nil,
            muscles: [(MuscleGroup, Double)]
        ) {
            let ex = Exercise(
                name: name,
                category: category,
                setPatternMode: mode,
                repTargetMin: repMin,
                repTargetMax: repMax,
                smallestIncrement: increment,
                isFavorite: favorite,
                suggestedRestSeconds: rest,
                machineSetting: machine,
                setupNotes: notes,
                benchmarkLow: benchmarkLow,
                benchmarkHigh: benchmarkHigh
            )
            context.insert(ex)
            for (muscle, coeff) in muscles {
                let m = MuscleMapping(muscleGroup: muscle, coefficient: coeff)
                m.exercise = ex
                context.insert(m)
                ex.muscleMappings.append(m)
            }
            map[name] = ex
        }

        // Canonical coefficients: primary = 1.0, secondary = 0.3, tertiary = 0.1.

        // ========== PULL / BACK ==========
        make("Tractions SN", category: "Pull", mode: .ramping, repMin: 5, repMax: 12, increment: 2.5, rest: 180, favorite: true,
             benchmarkLow: 0, benchmarkHigh: 40,
             muscles: [(.latSup, 1.0), (.latInf, 1.0), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.trapInf, 0.3), (.trapMid, 0.3), (.rhomboides, 0.3), (.brachioradial, 0.3), (.flechisseurs, 0.3), (.absBas, 0.1), (.transverse, 0.1), (.pectClav, 0.1)])

        make("Traction pronation large", category: "Pull", mode: .bodyweight, repMin: 5, repMax: 12, rest: 180,
             muscles: [(.latSup, 1.0), (.latInf, 1.0), (.trapMid, 0.3), (.trapInf, 0.3), (.rhomboides, 0.3), (.deltPost, 0.3), (.brachioradial, 0.3), (.bicepsLong, 0.1), (.bicepsCourt, 0.1), (.absBas, 0.1), (.transverse, 0.1)])

        make("Pulley serré", category: "Pull", mode: .straight, repMin: 6, repMax: 12, increment: 2.5, rest: 90,
             benchmarkLow: 40, benchmarkHigh: 80,
             muscles: [(.latInf, 1.0), (.latSup, 1.0), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.trapInf, 0.3), (.trapMid, 0.3), (.rhomboides, 0.3), (.brachioradial, 0.3), (.deltPost, 0.1), (.flechisseurs, 0.1), (.transverse, 0.1)])

        make("Tirage horizontal large", category: "Pull", mode: .straight, repMin: 6, repMax: 12, increment: 2.5, rest: 90,
             machine: "r7-6",
             benchmarkLow: 50, benchmarkHigh: 110,
             muscles: [(.trapMid, 1.0), (.rhomboides, 1.0), (.deltPost, 1.0), (.trapSup, 0.3), (.trapInf, 0.3), (.latSup, 0.3), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.brachioradial, 0.3), (.latInf, 0.1), (.transverse, 0.1)])

        make("Isolateral row", category: "Pull", mode: .ramping, repMin: 6, repMax: 10, increment: 5, rest: 120,
             machine: "r5",
             muscles: [(.latInf, 1.0), (.latSup, 1.0), (.trapMid, 1.0), (.rhomboides, 1.0), (.deltPost, 0.3), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.trapInf, 0.3), (.brachioradial, 0.1), (.flechisseurs, 0.1)])

        make("Row uni", category: "Pull", mode: .ramping, repMin: 6, repMax: 10, increment: 5, rest: 120,
             muscles: [(.latInf, 1.0), (.latSup, 1.0), (.trapMid, 1.0), (.rhomboides, 1.0), (.deltPost, 0.3), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.trapInf, 0.3), (.brachioradial, 0.3), (.transverse, 0.1), (.obliqueExt, 0.1), (.obliqueInt, 0.1)])

        make("Tirage vertical muscle up", category: "Pull", mode: .ramping, repMin: 6, repMax: 12, increment: 5, rest: 120,
             muscles: [(.latSup, 1.0), (.latInf, 1.0), (.trapInf, 0.3), (.trapMid, 0.3), (.rhomboides, 0.3), (.deltPost, 0.3), (.brachioradial, 0.3), (.bicepsLong, 0.1), (.flechisseurs, 0.1), (.transverse, 0.1)])

        // ========== CHEST ==========
        make("Chest Press", category: "Push", mode: .ramping, repMin: 6, repMax: 10, increment: 5, rest: 180, favorite: true,
             machine: "r5",
             benchmarkLow: 70, benchmarkHigh: 140,
             muscles: [(.pectStern, 1.0), (.pectClav, 0.3), (.deltAnt, 0.3), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.tricepsLong, 0.3), (.deltLat, 0.1), (.transverse, 0.1)])

        make("Développé incliné haltères", category: "Push", mode: .ramping, repMin: 6, repMax: 10, increment: 2, rest: 180,
             benchmarkLow: 20, benchmarkHigh: 45,
             muscles: [(.pectClav, 1.0), (.pectStern, 1.0), (.deltAnt, 0.3), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.tricepsLong, 0.3), (.deltLat, 0.1), (.transverse, 0.1)])

        make("Pec deck", category: "Push", mode: .ramping, repMin: 8, repMax: 12, increment: 5, rest: 90,
             machine: "r4",
             benchmarkLow: 50, benchmarkHigh: 100,
             muscles: [(.pectStern, 1.0), (.pectClav, 1.0), (.deltAnt, 0.3), (.tricepsLat, 0.1), (.tricepsMed, 0.1)])

        make("DC assisté", category: "Push", mode: .ramping, repMin: 6, repMax: 10, increment: 5, rest: 180,
             benchmarkLow: 40, benchmarkHigh: 100,
             muscles: [(.pectStern, 1.0), (.pectClav, 0.3), (.deltAnt, 0.3), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.tricepsLong, 0.3), (.deltLat, 0.1), (.transverse, 0.1)])

        // ========== SHOULDERS ==========
        make("Shoulder press", category: "Push", mode: .straight, repMin: 6, repMax: 10, increment: 5, rest: 180, favorite: true,
             benchmarkLow: 40, benchmarkHigh: 90,
             muscles: [(.deltAnt, 1.0), (.deltLat, 1.0), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.tricepsLong, 0.3), (.trapSup, 0.3), (.pectClav, 0.1), (.trapInf, 0.1), (.transverse, 0.1)])

        make("HSPU", category: "Push", mode: .bodyweight, repMin: 5, repMax: 12, rest: 120,
             muscles: [(.deltAnt, 1.0), (.deltLat, 1.0), (.tricepsLat, 1.0), (.tricepsMed, 1.0), (.tricepsLong, 0.3), (.pectClav, 0.3), (.trapSup, 0.3), (.trapInf, 0.3), (.absHaut, 0.1), (.absBas, 0.1), (.transverse, 0.1)])

        make("Lateral raises", category: "Push", mode: .straight, repMin: 10, repMax: 15, increment: 1, rest: 75,
             benchmarkLow: 8, benchmarkHigh: 20,
             muscles: [(.deltLat, 1.0), (.trapSup, 0.3), (.trapInf, 0.3), (.deltAnt, 0.1), (.deltPost, 0.1), (.transverse, 0.1)])

        make("Rear delt fly", category: "Pull", mode: .straight, repMin: 10, repMax: 15, increment: 2.5, rest: 75,
             benchmarkLow: 10, benchmarkHigh: 25,
             muscles: [(.deltPost, 1.0), (.rhomboides, 0.3), (.trapMid, 0.3), (.trapInf, 0.1), (.extenseurs, 0.1)])

        // ========== TRICEPS ==========
        make("Dips machine", category: "Push", mode: .ramping, repMin: 8, repMax: 12, increment: 5, rest: 90,
             benchmarkLow: 40, benchmarkHigh: 90,
             muscles: [(.tricepsLat, 1.0), (.tricepsMed, 1.0), (.tricepsLong, 1.0), (.pectStern, 0.3), (.deltAnt, 0.3), (.pectClav, 0.1), (.transverse, 0.1)])

        make("Extension triceps poulie", category: "Arms", mode: .straight, repMin: 10, repMax: 15, increment: 2.5, rest: 75,
             machine: "r16",
             benchmarkLow: 20, benchmarkHigh: 45,
             muscles: [(.tricepsLat, 1.0), (.tricepsMed, 1.0), (.tricepsLong, 0.3), (.flechisseurs, 0.1), (.extenseurs, 0.1)])

        make("Extension triceps haltère", category: "Arms", mode: .straight, repMin: 10, repMax: 15, increment: 2, rest: 75,
             benchmarkLow: 10, benchmarkHigh: 25,
             muscles: [(.tricepsLong, 1.0), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.deltAnt, 0.1), (.transverse, 0.1)])

        // ========== BICEPS / FOREARMS ==========
        make("Curl debout", category: "Arms", mode: .ramping, repMin: 6, repMax: 10, increment: 1, rest: 75, favorite: true,
             benchmarkLow: 14, benchmarkHigh: 25,
             muscles: [(.bicepsLong, 1.0), (.bicepsCourt, 1.0), (.brachioradial, 0.3), (.flechisseurs, 0.3), (.deltAnt, 0.1), (.extenseurs, 0.1)])

        make("Curl incliné", category: "Arms", mode: .straight, repMin: 8, repMax: 12, increment: 1, rest: 75,
             benchmarkLow: 10, benchmarkHigh: 22,
             muscles: [(.bicepsLong, 1.0), (.bicepsCourt, 0.3), (.brachioradial, 0.3), (.flechisseurs, 0.3), (.deltAnt, 0.1), (.extenseurs, 0.1)])

        make("Curl marteau poulie", category: "Arms", mode: .straight, repMin: 8, repMax: 12, increment: 2.5, rest: 75,
             benchmarkLow: 14, benchmarkHigh: 30,
             muscles: [(.brachioradial, 1.0), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.flechisseurs, 0.3), (.deltAnt, 0.1), (.extenseurs, 0.1)])

        make("Wrist curl", category: "Arms", mode: .straight, repMin: 12, repMax: 20, increment: 1, rest: 60,
             muscles: [(.flechisseurs, 1.0), (.extenseurs, 0.1), (.brachioradial, 0.1)])

        // ========== LEGS ==========
        make("Leg extension", category: "Legs", mode: .ramping, repMin: 8, repMax: 12, increment: 5, rest: 120, favorite: true,
             machine: "r3-5",
             benchmarkLow: 60, benchmarkHigh: 120,
             muscles: [(.droitFemoral, 1.0), (.vasteLat, 1.0), (.vasteMed, 1.0), (.bicepsFemoral, 0.1), (.semiTendineux, 0.1), (.transverse, 0.1)])

        make("Leg curl", category: "Legs", mode: .straight, repMin: 8, repMax: 12, increment: 5, rest: 120,
             machine: "r4-5",
             benchmarkLow: 45, benchmarkHigh: 90,
             muscles: [(.bicepsFemoral, 1.0), (.semiTendineux, 1.0), (.droitFemoral, 0.1), (.glutMax, 0.1), (.transverse, 0.1)])

        // ========== CORE ==========
        make("Crunch déclinés", category: "Core", mode: .straight, repMin: 8, repMax: 15, increment: 2.5, rest: 75, favorite: true,
             benchmarkLow: 15, benchmarkHigh: 60,
             muscles: [(.absHaut, 1.0), (.absBas, 1.0), (.obliqueExt, 0.3), (.obliqueInt, 0.3), (.transverse, 0.1), (.droitFemoral, 0.1)])

        make("Relevé de jambes chaise romaine", category: "Core", mode: .bodyweight, repMin: 8, repMax: 15, rest: 75,
             muscles: [(.absBas, 1.0), (.absHaut, 0.3), (.transverse, 0.3), (.obliqueExt, 0.3), (.obliqueInt, 0.3), (.droitFemoral, 0.3)])

        return map
    }

    // MARK: - Goals (parent-level)

    static func createGoals(context: ModelContext) {
        // User's actual weekly targets at the parent-group level.
        let goals: [(MuscleParent, Double)] = [
            (.pectoraux,    18),
            (.dosHaut,      16),
            (.grandDorsal,  16),
            (.deltoides,    22),   // covers ant + lat + post
            (.biceps,       12),
            (.triceps,      12),
            (.abs,          15),
            (.obliques,      8),
            (.forearms,      6),
            (.quads,         9),
            (.hamstrings,    9),
            (.glutes,        6),
        ]

        for (parent, sets) in goals {
            let goal = MuscleGoal(parent: parent, weeklyGoalSets: sets)
            context.insert(goal)
        }
    }

    // MARK: - Templates

    static func createTemplates(context: ModelContext, exercises: [String: Exercise]) {
        func template(_ name: String, _ names: [String]) {
            let t = WorkoutTemplate(name: name)
            context.insert(t)
            for (i, exName) in names.enumerated() {
                if let ex = exercises[exName] {
                    let te = TemplateExercise(orderIndex: i, exercise: ex, targetSets: 3)
                    context.insert(te)
                    t.templateExercises.append(te)
                }
            }
        }

        template("Full Body", [
            "Tractions SN",
            "Crunch déclinés",
            "HSPU",
            "Chest Press",
            "Leg extension",
            "Shoulder press",
            "Curl debout",
            "Pec deck",
            "Pulley serré"
        ])
    }

    // MARK: - Real Workout History

    static func createRealHistory(context: ModelContext, exercises: [String: Exercise]) {
        let cal = Calendar.current
        let year = cal.component(.year, from: Date())

        func date(_ month: Int, _ day: Int) -> Date {
            cal.date(from: DateComponents(year: year, month: month, day: day, hour: 18, minute: 0)) ?? Date()
        }

        func session(_ d: Date, duration: Int, _ exerciseData: [(String, [(Double, Int)])]) {
            let s = WorkoutSession(
                date: d,
                startTime: d,
                endTime: cal.date(byAdding: .minute, value: duration, to: d),
                isActive: false
            )
            context.insert(s)

            for (i, (name, sets)) in exerciseData.enumerated() {
                guard let ex = exercises[name] else { continue }
                let logged = LoggedExercise(orderIndex: i, exercise: ex)
                logged.session = s
                context.insert(logged)
                s.loggedExercises.append(logged)

                for (j, (weight, reps)) in sets.enumerated() {
                    let set = LoggedSet(weight: weight, reps: reps, setType: .work, timestamp: d, setSlotIndex: j)
                    set.loggedExercise = logged
                    context.insert(set)
                    logged.sets.append(set)
                }

                ex.lastUsed = d
            }
        }

        // April 15
        session(date(4, 15), duration: 53, [
            ("Tractions SN",        [(0, 11), (15, 6), (0, 10)]),
            ("Crunch déclinés",     [(50, 10), (50, 10), (50, 6)]),
            ("HSPU",                [(0, 10), (0, 8), (0, 5)]),
            ("Leg extension",       [(85, 10), (100, 10), (110, 4)]),
            ("Curl debout",         [(20, 6)]),
            ("Chest Press",         [(100, 10), (120, 8), (120, 5)]),
            ("Pulley serré",        [(60, 5), (50, 7)]),
        ])

        // April 13
        session(date(4, 13), duration: 52, [
            ("Tractions SN",        [(0, 10), (15, 7), (0, 10)]),
            ("HSPU",                [(0, 10), (0, 10), (0, 10)]),
            ("Crunch déclinés",     [(40, 10), (55, 8)]),
            ("Leg extension",       [(85, 10), (100, 10), (100, 7)]),
            ("Chest Press",         [(100, 10), (140, 2), (100, 5)]),
            ("Pulley serré",        [(50, 8), (55, 5)]),
        ])

        // April 10
        session(date(4, 10), duration: 85, [
            ("Tractions SN",        [(0, 10), (15, 6), (0, 8)]),
            ("Crunch déclinés",     [(45, 10), (50, 9), (50, 5)]),
            ("HSPU",                [(0, 10), (0, 10), (0, 5)]),
            ("Chest Press",         [(100, 8), (100, 8), (120, 4)]),
            ("Leg extension",       [(85, 11), (100, 10)]),
            ("Pulley serré",        [(50, 10), (60, 3), (50, 8)]),
            ("Curl debout",         [(18, 8), (18, 4)]),
            ("Pec deck",            [(80, 4), (70, 8), (70, 6)]),
            ("Tractions SN",        [(0, 10)]),
        ])

        // April 7
        session(date(4, 7), duration: 75, [
            ("Tractions SN",        [(15, 7), (0, 10), (0, 10)]),
            ("Crunch déclinés",     [(40, 10), (40, 10)]),
            ("HSPU",                [(0, 10)]),
            ("DC assisté",          [(80, 10), (100, 9), (120, 3)]),
            ("Leg extension",       [(85, 10)]),
            ("Curl debout",         [(18, 9), (20, 5), (18, 5)]),
            ("Shoulder press",      [(80, 10), (80, 10)]),
            ("Pec deck",            [(80, 4), (70, 6)]),
            ("Pulley serré",        [(50, 5), (50, 5)]),
        ])

        // April 3
        session(date(4, 3), duration: 50, [
            ("Tractions SN",        [(0, 10), (0, 10), (0, 10)]),
            ("Crunch déclinés",     [(40, 10), (40, 10), (40, 10)]),
            ("DC assisté",          [(80, 10), (100, 8), (90, 6)]),
            ("Shoulder press",      [(80, 8)]),
        ])

        // April 1
        session(date(4, 1), duration: 80, [
            ("Tractions SN",                [(15, 7), (0, 10), (0, 10)]),
            ("Crunch déclinés",                [(40, 10), (40, 10), (40, 10)]),
            ("HSPU",                        [(0, 10)]),
            ("Chest Press",                 [(100, 10), (120, 6), (100, 6)]),
            ("Leg extension",               [(85, 10)]),
            ("Pulley serré",                [(45, 10), (50, 8)]),
            ("Curl debout",                 [(20, 4), (18, 4)]),
            ("Shoulder press",              [(80, 10), (80, 8), (80, 4)]),
            ("Pec deck",                    [(85, 4), (75, 4)]),
        ])

        // March 30
        session(date(3, 30), duration: 85, [
            ("Tractions SN",                [(15, 7), (0, 10), (0, 10)]),
            ("Crunch déclinés",                [(40, 10), (40, 10), (40, 10)]),
            ("HSPU",                        [(0, 10)]),
            ("Leg curl",                    [(65, 10), (75, 10), (75, 10)]),
            ("Leg extension",               [(85, 10), (100, 10), (100, 8)]),
            ("Chest Press",                 [(100, 10), (120, 8), (100, 6)]),
            ("Pulley serré",                [(45, 8), (45, 7)]),
            ("Tirage horizontal large",     [(45, 6)]),
            ("Curl debout",                 [(20, 6), (18, 5)]),
        ])

        // March 25
        session(date(3, 25), duration: 70, [
            ("Tractions SN",                [(15, 7), (0, 10), (0, 10)]),
            ("Crunch déclinés",                [(40, 10), (40, 10), (40, 10)]),
            ("Leg extension",               [(85, 10), (100, 10), (100, 6)]),
            ("Curl incliné",                [(14, 10), (14, 4)]),
            ("Lateral raises",              [(14, 4)]),
            ("Pec deck",                    [(75, 10), (80, 4)]),
            ("Chest Press",                 [(125, 6), (100, 8)]),
        ])

        // March 23
        session(date(3, 23), duration: 65, [
            ("Tractions SN",                [(0, 10), (15, 5), (0, 8)]),
            ("Leg extension",               [(85, 10), (100, 8)]),
            ("Chest Press",                 [(100, 10), (130, 6), (130, 4)]),
            ("Shoulder press",              [(80, 10), (85, 5), (80, 4)]),
            ("Curl debout",                 [(18, 8), (18, 8)]),
        ])

        // March 20
        session(date(3, 20), duration: 70, [
            ("Tractions SN",                [(0, 10), (0, 10), (0, 10)]),
            ("Chest Press",                 [(100, 10), (120, 6), (120, 5), (100, 5)]),
            ("Lateral raises",              [(12, 10)]),
            ("Row uni",                     [(90, 6), (80, 10)]),
            ("Pec deck",                    [(60, 10), (70, 8), (75, 5)]),
            ("Shoulder press",              [(80, 4), (70, 10)]),
            ("Curl incliné",                [(14, 9), (14, 6)]),
        ])
    }
}
