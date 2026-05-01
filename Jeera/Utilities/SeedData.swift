import Foundation
import SwiftData

struct SeedData {
    private struct BenchmarkPreset {
        let benchmarkLow: Double?
        let benchmarkHigh: Double?
    }

    private struct MusclePreset {
        let mappings: [(MuscleGroup, Double)]
    }

    private static let canonicalWeeklyGoals: [(MuscleParent, Double)] = [
        (.pectoraux, 18),
        (.dosHaut, 14),
        (.grandDorsal, 14),
        (.deltoides, 18),
        (.biceps, 12),
        (.triceps, 12),
        (.abs, 14),
        (.obliques, 9),
        (.forearms, 9),
        (.quads, 9),
        (.hamstrings, 9),
        (.glutes, 9)
    ]

    static func seed(context: ModelContext) {
        let settings = UserSettings()
        context.insert(settings)

        let exercises = createExercises(context: context)
        createGoals(context: context)
        createTemplates(context: context, exercises: exercises)
        createRealHistory(context: context, exercises: exercises)

        try? context.save()
    }

    static func syncCanonicalExerciseMetadata(context: ModelContext) {
        let descriptor = FetchDescriptor<Exercise>()
        guard let exercises = try? context.fetch(descriptor), !exercises.isEmpty else { return }

        let presets = canonicalBenchmarkPresets
        let musclePresets = canonicalMusclePresets
        var didMutate = false

        for exercise in exercises {
            if let preset = presets[exercise.name] {
                if exercise.benchmarkLow != preset.benchmarkLow {
                    exercise.benchmarkLow = preset.benchmarkLow
                    didMutate = true
                }
                if exercise.benchmarkHigh != preset.benchmarkHigh {
                    exercise.benchmarkHigh = preset.benchmarkHigh
                    didMutate = true
                }
            }

            if let musclePreset = musclePresets[exercise.name] {
                let current = Dictionary(uniqueKeysWithValues: exercise.muscleMappings.map { ($0.muscleGroup, $0.coefficient) })
                let canonical = Dictionary(uniqueKeysWithValues: musclePreset.mappings)
                if current != canonical {
                    for mapping in exercise.muscleMappings {
                        context.delete(mapping)
                    }
                    exercise.muscleMappings.removeAll()
                    for (muscle, coeff) in musclePreset.mappings {
                        let mapping = MuscleMapping(muscleGroup: muscle, coefficient: coeff)
                        context.insert(mapping)
                        mapping.exercise = exercise
                        exercise.muscleMappings.append(mapping)
                    }
                    didMutate = true
                }
            }
        }

        if didMutate {
            try? context.save()
        }
    }

    static func syncCanonicalGoals(context: ModelContext) {
        let descriptor = FetchDescriptor<MuscleGoal>()
        let existing = (try? context.fetch(descriptor)) ?? []
        let goalByParent = Dictionary(uniqueKeysWithValues: existing.map { ($0.parent, $0) })
        var didMutate = false

        for (parent, sets) in canonicalWeeklyGoals {
            if goalByParent[parent] == nil {
                context.insert(MuscleGoal(parent: parent, weeklyGoalSets: sets))
                didMutate = true
            }
        }

        if didMutate {
            try? context.save()
        }
    }

    private static let canonicalBenchmarkPresets: [String: BenchmarkPreset] = [
        "Tractions SN": .init(benchmarkLow: 25.5, benchmarkHigh: 69.8),
        "Traction pronation large": .init(benchmarkLow: 25.5, benchmarkHigh: 69.8),
        "Pulley serré": .init(benchmarkLow: 60, benchmarkHigh: 120),
        "Tirage horizontal large": .init(benchmarkLow: 60, benchmarkHigh: 120),
        "Isolateral row": .init(benchmarkLow: 75, benchmarkHigh: 150),
        "Row uni": .init(benchmarkLow: 90, benchmarkHigh: 180),
        "Row unilatéral": .init(benchmarkLow: 90, benchmarkHigh: 180),
        "Tirage vertical muscle up": .init(benchmarkLow: 60, benchmarkHigh: 105),
        "Tirage vertical muscle-up grip": .init(benchmarkLow: 60, benchmarkHigh: 105),
        "Chest Press": .init(benchmarkLow: 75, benchmarkHigh: 135),
        "Chest press machine": .init(benchmarkLow: 75, benchmarkHigh: 135),
        "Shoulder press": .init(benchmarkLow: 60, benchmarkHigh: 120),
        "Shoulder press machine": .init(benchmarkLow: 60, benchmarkHigh: 120),
        "Développé incliné haltères": .init(benchmarkLow: 30, benchmarkHigh: 51),
        "Pec deck": .init(benchmarkLow: 60, benchmarkHigh: 120),
        "DC assisté": .init(benchmarkLow: 75, benchmarkHigh: 135),
        "HSPU": .init(benchmarkLow: nil, benchmarkHigh: nil),
        "Lateral raises": .init(benchmarkLow: 12, benchmarkHigh: 27),
        "Rear delt fly": .init(benchmarkLow: 45, benchmarkHigh: 105),
        "Dips machine": .init(benchmarkLow: 75, benchmarkHigh: 165),
        "Extension triceps poulie": .init(benchmarkLow: 39, benchmarkHigh: 84),
        "Extension triceps haltère": .init(benchmarkLow: 24, benchmarkHigh: 51),
        "Extension triceps haltère overhead": .init(benchmarkLow: 24, benchmarkHigh: 51),
        "Curl debout": .init(benchmarkLow: 18, benchmarkHigh: 39),
        "Curl incliné": .init(benchmarkLow: 15, benchmarkHigh: 33),
        "Curl marteau poulie": .init(benchmarkLow: 15, benchmarkHigh: 33),
        "Wrist curl": .init(benchmarkLow: 45, benchmarkHigh: 120),
        "Leg extension": .init(benchmarkLow: 75, benchmarkHigh: 150),
        "Leg curl": .init(benchmarkLow: 60, benchmarkHigh: 120),
        "Crunch déclinés": .init(benchmarkLow: 60, benchmarkHigh: 135),
        "Crunch déclinés lesté": .init(benchmarkLow: 60, benchmarkHigh: 135),
        "Relevé de jambes chaise romaine": .init(benchmarkLow: 32.2, benchmarkHigh: 94.5)
    ]

    private static let tirageVerticalMuscleUpMappings: [(MuscleGroup, Double)] = [
        (.tricepsLong, 0.7),
        (.latInf, 0.35),
        (.latSup, 0.2),
        (.pectStern, 0.25),
        (.trapInf, 0.2),
        (.deltPost, 0.1),
        (.trapMid, 0.1),
        (.transverse, 0.1)
    ]

    private static let canonicalMusclePresets: [String: MusclePreset] = [
        "Tirage vertical muscle up": .init(mappings: tirageVerticalMuscleUpMappings),
        "Tirage vertical muscle-up grip": .init(mappings: tirageVerticalMuscleUpMappings)
    ]

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
            fatigueClass: FatigueClass = .medium,
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
                benchmarkHigh: benchmarkHigh,
                fatigueClass: fatigueClass
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
        // Benchmarks, rep ranges, rest, increments + fatigue class sourced from the
        // scientific cartography. Rest uses the mid-point of the prescribed range.
        make("Tractions SN", category: "Pull", mode: .weightedBodyweight, repMin: 6, repMax: 10, increment: 1.25, rest: 150, favorite: true,
             benchmarkLow: 25.5, benchmarkHigh: 69.8, fatigueClass: .heavy,
             muscles: [(.latSup, 1.0), (.latInf, 1.0), (.bracchial, 0.3), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.trapInf, 0.3), (.trapMid, 0.3), (.rhomboides, 0.3), (.brachioradial, 0.3), (.flechisseurs, 0.1), (.transverse, 0.1), (.obliqueExt, 0.1), (.obliqueInt, 0.1)])

        make("Traction pronation large", category: "Pull", mode: .weightedBodyweight, repMin: 6, repMax: 10, increment: 1.25, rest: 150,
             benchmarkLow: 25.5, benchmarkHigh: 69.8, fatigueClass: .heavy,
             muscles: [(.latSup, 1.0), (.latInf, 1.0), (.trapInf, 0.3), (.trapMid, 0.3), (.rhomboides, 0.3), (.deltPost, 0.3), (.bracchial, 0.3), (.brachioradial, 0.3), (.bicepsLong, 0.1), (.bicepsCourt, 0.1), (.flechisseurs, 0.1), (.transverse, 0.1), (.obliqueExt, 0.1), (.obliqueInt, 0.1)])

        make("Pulley serré", category: "Pull", mode: .straight, repMin: 8, repMax: 12, increment: 2.5, rest: 120,
             benchmarkLow: 60, benchmarkHigh: 120, fatigueClass: .medium,
             muscles: [(.latInf, 1.0), (.latSup, 1.0), (.trapMid, 1.0), (.rhomboides, 1.0), (.deltPost, 0.3), (.trapInf, 0.3), (.bracchial, 0.3), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.brachioradial, 0.3), (.flechisseurs, 0.1), (.transverse, 0.1), (.obliqueExt, 0.1), (.obliqueInt, 0.1)])

        make("Tirage horizontal large", category: "Pull", mode: .straight, repMin: 8, repMax: 12, increment: 2.5, rest: 120,
             machine: "r7-6",
             benchmarkLow: 60, benchmarkHigh: 120, fatigueClass: .medium,
             muscles: [(.trapMid, 1.0), (.rhomboides, 1.0), (.deltPost, 1.0), (.trapInf, 0.3), (.trapSup, 0.3), (.latSup, 0.3), (.bracchial, 0.3), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.brachioradial, 0.3), (.flechisseurs, 0.1), (.transverse, 0.1), (.obliqueExt, 0.1), (.obliqueInt, 0.1)])

        make("Isolateral row", category: "Pull", mode: .straight, repMin: 8, repMax: 12, increment: 2.5, rest: 120,
             machine: "r5",
             benchmarkLow: 75, benchmarkHigh: 150, fatigueClass: .medium,
             muscles: [(.latInf, 1.0), (.latSup, 1.0), (.trapMid, 1.0), (.rhomboides, 1.0), (.deltPost, 0.3), (.trapInf, 0.3), (.bracchial, 0.3), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.brachioradial, 0.3), (.flechisseurs, 0.1)])

        make("Row uni", category: "Pull", mode: .straight, repMin: 8, repMax: 12, increment: 2, rest: 120,
             benchmarkLow: 90, benchmarkHigh: 180, fatigueClass: .medium,
             muscles: [(.latInf, 1.0), (.latSup, 1.0), (.trapMid, 1.0), (.rhomboides, 1.0), (.deltPost, 0.3), (.trapInf, 0.3), (.bracchial, 0.3), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.brachioradial, 0.3), (.transverse, 0.1), (.obliqueExt, 0.1), (.obliqueInt, 0.1), (.flechisseurs, 0.1)])

        make("Tirage vertical muscle up", category: "Pull", mode: .straight, repMin: 8, repMax: 12, increment: 2.5, rest: 120,
             benchmarkLow: 60, benchmarkHigh: 105, fatigueClass: .medium,
             muscles: tirageVerticalMuscleUpMappings)

        // ========== CHEST ==========
        make("Chest Press", category: "Push", mode: .straight, repMin: 6, repMax: 10, increment: 2.5, rest: 150, favorite: true,
             machine: "r5",
             benchmarkLow: 75, benchmarkHigh: 135, fatigueClass: .heavy,
             muscles: [(.pectStern, 1.0), (.pectClav, 0.3), (.deltAnt, 0.3), (.tricepsLong, 0.3), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.transverse, 0.1)])

        make("Développé incliné haltères", category: "Push", mode: .straight, repMin: 6, repMax: 10, increment: 2, rest: 150,
             benchmarkLow: 30, benchmarkHigh: 51, fatigueClass: .heavy,
             muscles: [(.pectClav, 1.0), (.pectStern, 1.0), (.deltAnt, 0.3), (.tricepsLong, 0.3), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.transverse, 0.1)])

        make("Pec deck", category: "Push", mode: .straight, repMin: 10, repMax: 15, increment: 2.5, rest: 75,
             machine: "r4",
             benchmarkLow: 60, benchmarkHigh: 120, fatigueClass: .light,
             muscles: [(.pectStern, 1.0), (.pectClav, 1.0), (.deltAnt, 0.3)])

        make("DC assisté", category: "Push", mode: .straight, repMin: 6, repMax: 10, increment: 2.5, rest: 150,
             benchmarkLow: 75, benchmarkHigh: 135, fatigueClass: .heavy,
             muscles: [(.pectStern, 1.0), (.pectClav, 0.3), (.deltAnt, 0.3), (.tricepsLong, 0.3), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.transverse, 0.1)])

        // ========== SHOULDERS ==========
        make("Shoulder press", category: "Push", mode: .straight, repMin: 6, repMax: 10, increment: 2.5, rest: 150, favorite: true,
             benchmarkLow: 60, benchmarkHigh: 120, fatigueClass: .heavy,
             muscles: [(.deltAnt, 1.0), (.deltLat, 1.0), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.tricepsLong, 0.3), (.trapSup, 0.3), (.pectClav, 0.1), (.trapInf, 0.1), (.transverse, 0.1)])

        // No weight benchmark band for HSPU: this exercise is tracked in reps in
        // this app, and the user explicitly does not want a fake 10RM-style
        // weighted comparison zone rendered for it.
        make("HSPU", category: "Push", mode: .weightedBodyweight, repMin: 5, repMax: 10, increment: 1.25, rest: 180,
             benchmarkLow: nil, benchmarkHigh: nil, fatigueClass: .heavy,
             muscles: [(.deltAnt, 1.0), (.deltLat, 1.0), (.tricepsLat, 1.0), (.tricepsMed, 1.0), (.tricepsLong, 0.3), (.pectClav, 0.3), (.trapSup, 0.3), (.trapInf, 0.3), (.absHaut, 0.1), (.absBas, 0.1), (.transverse, 0.1), (.obliqueExt, 0.1), (.obliqueInt, 0.1)])

        make("Lateral raises", category: "Push", mode: .straight, repMin: 10, repMax: 20, increment: 1, rest: 75,
             benchmarkLow: 12, benchmarkHigh: 27, fatigueClass: .light,
             muscles: [(.deltLat, 1.0), (.trapSup, 0.3), (.trapInf, 0.3), (.deltAnt, 0.1), (.deltPost, 0.1)])

        make("Rear delt fly", category: "Pull", mode: .straight, repMin: 10, repMax: 20, increment: 2.5, rest: 75,
             benchmarkLow: 45, benchmarkHigh: 105, fatigueClass: .light,
             muscles: [(.deltPost, 1.0), (.trapMid, 0.3), (.rhomboides, 0.3), (.trapInf, 0.1)])

        // ========== TRICEPS ==========
        make("Dips machine", category: "Push", mode: .assistedBodyweight, repMin: 6, repMax: 10, increment: 1.25, rest: 150,
             benchmarkLow: 75, benchmarkHigh: 165, fatigueClass: .heavy,
             muscles: [(.tricepsLat, 1.0), (.tricepsMed, 1.0), (.tricepsLong, 1.0), (.pectStern, 0.3), (.deltAnt, 0.3), (.pectClav, 0.1), (.transverse, 0.1)])

        make("Extension triceps poulie", category: "Arms", mode: .straight, repMin: 8, repMax: 15, increment: 2.5, rest: 75,
             machine: "r16",
             benchmarkLow: 39, benchmarkHigh: 84, fatigueClass: .light,
             muscles: [(.tricepsLat, 1.0), (.tricepsMed, 1.0), (.tricepsLong, 0.3), (.flechisseurs, 0.1), (.extenseurs, 0.1)])

        make("Extension triceps haltère", category: "Arms", mode: .straight, repMin: 8, repMax: 15, increment: 2.5, rest: 90,
             benchmarkLow: 24, benchmarkHigh: 51, fatigueClass: .light,
             muscles: [(.tricepsLong, 1.0), (.tricepsLat, 0.3), (.tricepsMed, 0.3), (.deltAnt, 0.1), (.transverse, 0.1)])

        // ========== BICEPS / FOREARMS ==========
        make("Curl debout", category: "Arms", mode: .straight, repMin: 6, repMax: 10, increment: 2.5, rest: 90, favorite: true,
             benchmarkLow: 18, benchmarkHigh: 39, fatigueClass: .medium,
             muscles: [(.bicepsLong, 1.0), (.bicepsCourt, 1.0), (.bracchial, 1.0), (.brachioradial, 0.3), (.flechisseurs, 0.3), (.extenseurs, 0.1)])

        make("Curl incliné", category: "Arms", mode: .straight, repMin: 8, repMax: 15, increment: 2, rest: 90,
             benchmarkLow: 15, benchmarkHigh: 33, fatigueClass: .light,
             muscles: [(.bicepsLong, 1.0), (.bracchial, 1.0), (.bicepsCourt, 0.3), (.brachioradial, 0.3), (.flechisseurs, 0.3), (.extenseurs, 0.1)])

        make("Curl marteau poulie", category: "Arms", mode: .straight, repMin: 8, repMax: 15, increment: 2.5, rest: 75,
             benchmarkLow: 15, benchmarkHigh: 33, fatigueClass: .light,
             muscles: [(.bracchial, 1.0), (.brachioradial, 1.0), (.bicepsLong, 0.3), (.bicepsCourt, 0.3), (.flechisseurs, 0.3), (.extenseurs, 0.1)])

        make("Wrist curl", category: "Arms", mode: .straight, repMin: 12, repMax: 20, increment: 1.25, rest: 60,
             benchmarkLow: 45, benchmarkHigh: 120, fatigueClass: .light,
             muscles: [(.flechisseurs, 1.0), (.extenseurs, 0.1), (.brachioradial, 0.1)])

        // ========== LEGS ==========
        make("Leg extension", category: "Legs", mode: .straight, repMin: 10, repMax: 15, increment: 2.5, rest: 75, favorite: true,
             machine: "r3-5",
             benchmarkLow: 75, benchmarkHigh: 150, fatigueClass: .light,
             muscles: [(.droitFemoral, 1.0), (.vasteLat, 1.0), (.vasteMed, 1.0)])

        make("Leg curl", category: "Legs", mode: .straight, repMin: 8, repMax: 15, increment: 2.5, rest: 75,
             machine: "r4-5",
             benchmarkLow: 60, benchmarkHigh: 120, fatigueClass: .light,
             muscles: [(.bicepsFemoral, 1.0), (.semiTendineux, 1.0)])

        // ========== CORE ==========
        make("Crunch déclinés", category: "Core", mode: .straight, repMin: 10, repMax: 20, increment: 2.5, rest: 60, favorite: true,
             benchmarkLow: 60, benchmarkHigh: 135, fatigueClass: .light,
             muscles: [(.absHaut, 1.0), (.absBas, 1.0), (.obliqueExt, 0.3), (.obliqueInt, 0.3), (.transverse, 0.1), (.droitFemoral, 0.1)])

        make("Relevé de jambes chaise romaine", category: "Core", mode: .weightedBodyweight, repMin: 10, repMax: 20, increment: 1.25, rest: 60,
             benchmarkLow: 32.2, benchmarkHigh: 94.5, fatigueClass: .light,
             muscles: [(.absBas, 1.0), (.absHaut, 0.3), (.transverse, 0.3), (.obliqueExt, 0.3), (.obliqueInt, 0.3), (.droitFemoral, 0.3)])

        return map
    }

    // MARK: - Goals (parent-level)

    static func createGoals(context: ModelContext) {
        for (parent, sets) in canonicalWeeklyGoals {
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
