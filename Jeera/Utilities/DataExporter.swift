import Foundation
import SwiftData

// MARK: - Codable Mirror Types

struct JeeraBackup: Codable {
    let version: Int
    let exportDate: Date
    let exercises: [ExerciseData]
    let goals: [GoalData]
    let settings: SettingsData?
    let sessions: [SessionData]
    let templates: [TemplateData]
}

struct ExerciseData: Codable {
    let id: String
    let name: String
    let category: String
    let setPatternMode: String
    let repTargetMin: Int
    let repTargetMax: Int
    let smallestIncrement: Double
    let isFavorite: Bool
    let createdByUser: Bool
    let sortOrder: Int
    let suggestedRestSeconds: Int
    let lastUsed: Date?
    let machineSetting: String?
    let setupNotes: String?
    let muscleMappings: [MuscleMappingData]
}

struct MuscleMappingData: Codable {
    let muscleGroup: String
    let coefficient: Double
}

struct GoalData: Codable {
    let muscleGroup: String
    let weeklyGoalSets: Double
}

struct SettingsData: Codable {
    let usesKilograms: Bool
    let defaultSmallestIncrement: Double
    let defaultRestTimerSeconds: Int
    let defaultRepTargetMin: Int
    let defaultRepTargetMax: Int
    let userName: String?
    let supersetRestSeconds: Int?
}

struct SessionData: Codable {
    let id: String
    let date: Date
    let startTime: Date
    let endTime: Date?
    let notes: String
    let templateName: String?
    let exercises: [LoggedExerciseData]
    /// First-class superset groups for this session. Optional so backups from
    /// earlier versions (which encoded pairing via `isLinkedToNext`) still
    /// decode cleanly; the importer rebuilds groups from the adjacency bits
    /// when this field is missing.
    let supersetGroups: [SupersetGroupData]?
}

struct SupersetGroupData: Codable {
    let id: String
    let orderIndex: Int
    /// Ordered LoggedExercise ids (uuidString) forming the group.
    let memberIDs: [String]
}

struct LoggedExerciseData: Codable {
    let id: String?           // New: stable id used by SupersetGroupData.memberIDs
    let exerciseId: String
    let exerciseName: String
    let orderIndex: Int
    let notes: String
    let isLinkedToNext: Bool
    let sets: [LoggedSetData]
}

struct LoggedSetData: Codable {
    let weight: Double
    let reps: Int
    let setType: String
    let timestamp: Date
    let setSlotIndex: Int
    let completed: Bool
    let supersetRoundIndex: Int?
}

struct TemplateData: Codable {
    let name: String
    let sortOrder: Int
    let exercises: [TemplateExerciseData]
}

struct TemplateExerciseData: Codable {
    let exerciseName: String
    let orderIndex: Int
    let targetSets: Int
}

// MARK: - Exporter

struct DataExporter {

    static func exportAll(context: ModelContext) throws -> Data {
        // Fetch all data
        let exercises = (try? context.fetch(FetchDescriptor<Exercise>())) ?? []
        let goals = (try? context.fetch(FetchDescriptor<MuscleGoal>())) ?? []
        let settings = (try? context.fetch(FetchDescriptor<UserSettings>()))?.first
        let sessions = (try? context.fetch(FetchDescriptor<WorkoutSession>(
            predicate: #Predicate { !$0.isActive },
            sortBy: [SortDescriptor(\WorkoutSession.startTime, order: .reverse)]
        ))) ?? []
        let templates = (try? context.fetch(FetchDescriptor<WorkoutTemplate>())) ?? []

        let backup = JeeraBackup(
            version: 1,
            exportDate: Date(),
            exercises: exercises.map { ex in
                ExerciseData(
                    id: ex.id.uuidString,
                    name: ex.name,
                    category: ex.category,
                    setPatternMode: ex.setPatternMode.rawValue,
                    repTargetMin: ex.repTargetMin,
                    repTargetMax: ex.repTargetMax,
                    smallestIncrement: ex.smallestIncrement,
                    isFavorite: ex.isFavorite,
                    createdByUser: ex.createdByUser,
                    sortOrder: ex.sortOrder,
                    suggestedRestSeconds: ex.suggestedRestSeconds,
                    lastUsed: ex.lastUsed,
                    machineSetting: ex.machineSetting,
                    setupNotes: ex.setupNotes,
                    muscleMappings: ex.muscleMappings.map { m in
                        MuscleMappingData(muscleGroup: m.muscleGroup.rawValue, coefficient: m.coefficient)
                    }
                )
            },
            goals: goals.map { g in
                GoalData(muscleGroup: g.muscleGroupRaw, weeklyGoalSets: g.weeklyGoalSets)
            },
            settings: settings.map { s in
                SettingsData(
                    usesKilograms: s.usesKilograms,
                    defaultSmallestIncrement: s.defaultSmallestIncrement,
                    defaultRestTimerSeconds: s.defaultRestTimerSeconds,
                    defaultRepTargetMin: s.defaultRepTargetMin,
                    defaultRepTargetMax: s.defaultRepTargetMax,
                    userName: s.userName,
                    supersetRestSeconds: s.supersetRestSeconds
                )
            },
            sessions: sessions.map { session in
                SessionData(
                    id: session.id.uuidString,
                    date: session.date,
                    startTime: session.startTime,
                    endTime: session.endTime,
                    notes: session.notes,
                    templateName: session.template?.name,
                    exercises: session.orderedExercises.map { le in
                        LoggedExerciseData(
                            id: le.id.uuidString,
                            exerciseId: le.exercise?.id.uuidString ?? "",
                            exerciseName: le.exercise?.name ?? "Unknown",
                            orderIndex: le.orderIndex,
                            notes: le.notes,
                            isLinkedToNext: le.isLinkedToNext,
                            sets: le.orderedSets.map { s in
                                LoggedSetData(
                                    weight: s.weight,
                                    reps: s.reps,
                                    setType: s.setType.rawValue,
                                    timestamp: s.timestamp,
                                    setSlotIndex: s.setSlotIndex,
                                    completed: s.completed,
                                    supersetRoundIndex: s.supersetRoundIndex
                                )
                            }
                        )
                    },
                    supersetGroups: session.supersetGroups.map { g in
                        SupersetGroupData(
                            id: g.id.uuidString,
                            orderIndex: g.orderIndex,
                            memberIDs: g.memberOrder.map { $0.uuidString }
                        )
                    }
                )
            },
            templates: templates.map { t in
                TemplateData(
                    name: t.name,
                    sortOrder: t.sortOrder,
                    exercises: t.orderedExercises.map { te in
                        TemplateExerciseData(
                            exerciseName: te.exercise?.name ?? "",
                            orderIndex: te.orderIndex,
                            targetSets: te.targetSets
                        )
                    }
                )
            }
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(backup)
    }

    // MARK: - Importer

    static func importAll(data: Data, context: ModelContext) throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let backup = try decoder.decode(JeeraBackup.self, from: data)

        // Clear existing data (order matters for relationships)
        try clearAll(context: context)

        // 1. Import exercises first (sessions reference them)
        var exerciseMap: [String: Exercise] = [:] // id -> Exercise
        var exerciseByName: [String: Exercise] = [:] // name -> Exercise

        for exData in backup.exercises {
            let ex = Exercise(
                id: UUID(uuidString: exData.id) ?? UUID(),
                name: exData.name,
                category: exData.category,
                setPatternMode: SetPatternMode(rawValue: exData.setPatternMode) ?? .straight,
                repTargetMin: exData.repTargetMin,
                repTargetMax: exData.repTargetMax,
                smallestIncrement: exData.smallestIncrement,
                isFavorite: exData.isFavorite,
                createdByUser: exData.createdByUser,
                sortOrder: exData.sortOrder,
                suggestedRestSeconds: exData.suggestedRestSeconds,
                machineSetting: exData.machineSetting ?? "",
                setupNotes: exData.setupNotes ?? ""
            )
            ex.lastUsed = exData.lastUsed
            context.insert(ex)

            for mData in exData.muscleMappings {
                let mg: MuscleGroup?
                if let direct = MuscleGroup(rawValue: mData.muscleGroup) {
                    mg = direct
                } else {
                    mg = MuscleGroup.legacyMapping[mData.muscleGroup]
                }
                if let muscle = mg {
                    let mapping = MuscleMapping(muscleGroup: muscle, coefficient: mData.coefficient)
                    mapping.exercise = ex
                    context.insert(mapping)
                    ex.muscleMappings.append(mapping)
                }
            }

            exerciseMap[exData.id] = ex
            exerciseByName[exData.name] = ex
        }

        // 2. Import goals (parent-level)
        for gData in backup.goals {
            // Try direct parent match first, then leaf → parent migration
            let parent: MuscleParent?
            if let direct = MuscleParent(rawValue: gData.muscleGroup) {
                parent = direct
            } else if let leaf = MuscleGroup(rawValue: gData.muscleGroup) {
                parent = leaf.parent
            } else if let legacy = MuscleGroup.legacyMapping[gData.muscleGroup] {
                parent = legacy.parent
            } else {
                parent = nil
            }
            if let p = parent {
                let goal = MuscleGoal(parent: p, weeklyGoalSets: gData.weeklyGoalSets)
                context.insert(goal)
            }
        }

        // 3. Import settings
        if let sData = backup.settings {
            let settings = UserSettings(
                usesKilograms: sData.usesKilograms,
                defaultSmallestIncrement: sData.defaultSmallestIncrement,
                defaultRestTimerSeconds: sData.defaultRestTimerSeconds,
                defaultRepTargetMin: sData.defaultRepTargetMin,
                defaultRepTargetMax: sData.defaultRepTargetMax,
                userName: sData.userName ?? "Evan",
                supersetRestSeconds: sData.supersetRestSeconds ?? 180
            )
            context.insert(settings)
        } else {
            context.insert(UserSettings())
        }

        // 4. Import templates
        for tData in backup.templates {
            let template = WorkoutTemplate(name: tData.name, sortOrder: tData.sortOrder)
            context.insert(template)

            for teData in tData.exercises {
                let exercise = exerciseByName[teData.exerciseName]
                let te = TemplateExercise(orderIndex: teData.orderIndex, exercise: exercise, targetSets: teData.targetSets)
                context.insert(te)
                template.templateExercises.append(te)
            }
        }

        // 5. Import sessions
        for sData in backup.sessions {
            let session = WorkoutSession(
                id: UUID(uuidString: sData.id) ?? UUID(),
                date: sData.date,
                startTime: sData.startTime,
                endTime: sData.endTime,
                notes: sData.notes,
                isActive: false
            )
            context.insert(session)

            // Index exercises by their persisted id so we can re-wire the
            // superset-group memberships after everything is inserted.
            var loggedByID: [UUID: LoggedExercise] = [:]

            for leData in sData.exercises {
                // Match exercise by ID first, then by name
                let exercise = exerciseMap[leData.exerciseId] ?? exerciseByName[leData.exerciseName]

                let loggedID = leData.id.flatMap { UUID(uuidString: $0) } ?? UUID()
                let logged = LoggedExercise(
                    id: loggedID,
                    orderIndex: leData.orderIndex,
                    notes: leData.notes,
                    exercise: exercise
                )
                logged.session = session
                context.insert(logged)
                session.loggedExercises.append(logged)
                loggedByID[loggedID] = logged

                for setData in leData.sets {
                    let set = LoggedSet(
                        weight: setData.weight,
                        reps: setData.reps,
                        setType: SetType(rawValue: setData.setType) ?? .work,
                        timestamp: setData.timestamp,
                        setSlotIndex: setData.setSlotIndex,
                        completed: setData.completed,
                        supersetRoundIndex: setData.supersetRoundIndex
                    )
                    set.loggedExercise = logged
                    context.insert(set)
                    logged.sets.append(set)
                }
            }

            // Rebuild superset groups. If the backup carries `supersetGroups`,
            // use them verbatim. Otherwise, reconstruct from the legacy
            // adjacency bit so old backups still restore paired supersets.
            if let groups = sData.supersetGroups, !groups.isEmpty {
                for gData in groups {
                    let members = gData.memberIDs
                        .compactMap { UUID(uuidString: $0) }
                        .compactMap { loggedByID[$0] }
                    guard members.count >= 2 else { continue }
                    let group = SupersetGroup(
                        id: UUID(uuidString: gData.id) ?? UUID(),
                        orderIndex: gData.orderIndex,
                        memberOrder: members.map(\.id),
                        session: session,
                        members: members
                    )
                    context.insert(group)
                    session.supersetGroups.append(group)
                    for m in members { m.supersetGroup = group }
                }
            } else {
                // Legacy path: walk the session's ordered exercises and form a
                // group whenever we hit a run of `isLinkedToNext` exercises.
                var runStart: LoggedExercise? = nil
                var run: [LoggedExercise] = []
                let ordered = sData.exercises
                for (i, leData) in ordered.enumerated() {
                    guard let logged = loggedByID[leData.id.flatMap { UUID(uuidString: $0) } ?? UUID()] else { continue }
                    if leData.isLinkedToNext {
                        if runStart == nil { runStart = logged; run = [logged] }
                        // Peek ahead — next exercise joins the run.
                        if i + 1 < ordered.count,
                           let next = loggedByID[ordered[i + 1].id.flatMap { UUID(uuidString: $0) } ?? UUID()] {
                            run.append(next)
                        }
                    } else if !run.isEmpty {
                        let members = run
                        run = []
                        runStart = nil
                        guard members.count >= 2 else { continue }
                        let group = SupersetGroup(
                            orderIndex: members.first?.orderIndex ?? 0,
                            memberOrder: members.map(\.id),
                            session: session,
                            members: members
                        )
                        context.insert(group)
                        session.supersetGroups.append(group)
                        for m in members { m.supersetGroup = group }
                    }
                }
            }
        }

        try context.save()
    }

    // MARK: - Clear All Data

    private static func clearAll(context: ModelContext) throws {
        // Delete in dependency order
        try context.delete(model: LoggedSet.self)
        try context.delete(model: SupersetGroup.self)
        try context.delete(model: LoggedExercise.self)
        try context.delete(model: WorkoutSession.self)
        try context.delete(model: TemplateExercise.self)
        try context.delete(model: WorkoutTemplate.self)
        try context.delete(model: MuscleMapping.self)
        try context.delete(model: Exercise.self)
        try context.delete(model: MuscleGoal.self)
        try context.delete(model: UserSettings.self)
        try context.save()
    }

    // MARK: - File Name

    static func defaultFileName() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HHmm"
        return "jeera_backup_\(formatter.string(from: Date())).json"
    }
}
