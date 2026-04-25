import Foundation
import SwiftData
import SwiftUI
import Combine
import UserNotifications

@Observable
class WorkoutViewModel {
    enum WorkoutMode: String, CaseIterable, Identifiable {
        case normal
        case beast
        case monk
        var id: String { rawValue }
        var displayName: String {
            switch self {
            case .normal: return "Normal"
            case .beast: return "Beast"
            case .monk: return "Monk"
            }
        }

        var shortDescription: String {
            switch self {
            case .normal:
                return "Base habituelle, progression standard"
            case .beast:
                return "Charge agressive, ambiance brutale"
            case .monk:
                return "Déficits hebdo, ordre plus paisible"
            }
        }

        var symbolName: String {
            switch self {
            case .normal:
                return "figure.strengthtraining.traditional"
            case .beast:
                return "flame.fill"
            case .monk:
                return "leaf.fill"
            }
        }

        var accentColor: Color {
            switch self {
            case .normal:
                return .blue
            case .beast:
                return .orange
            case .monk:
                return .green
            }
        }

        var secondaryColor: Color {
            switch self {
            case .normal:
                return Color(red: 0.30, green: 0.57, blue: 0.96)
            case .beast:
                return Color(red: 0.80, green: 0.18, blue: 0.12)
            case .monk:
                return Color(red: 0.17, green: 0.52, blue: 0.47)
            }
        }
    }

    struct FinishedWorkoutSnapshot: Identifiable, Equatable {
        struct MuscleImpact: Identifiable, Equatable {
            let parent: MuscleParent
            let sets: Int

            var id: String { parent.rawValue }
        }

        let id = UUID()
        let duration: String
        let setCount: Int
        let exerciseCount: Int
        let prCount: Int
        let progressionSignal: String
        let topMuscles: [MuscleImpact]
        let prHighlights: [String]
    }

    private struct SupersetPoint {
        let exerciseID: UUID
        let timestamp: Date
    }

    var modelContext: ModelContext?
    var activeSession: WorkoutSession?
    var showExercisePicker = false
    var showFinishConfirmation = false
    var restTimer = RestTimerModel()
    var currentRestSuggested: Int = 120
    var undoAction: (() -> Void)?
    var undoMessage: String?
    var showUndo = false
    var currentAchievement: ProgressionEngine.Achievement?
    var showAchievement = false
    var completedWorkoutSummary: String?
    var finishedWorkoutSnapshot: FinishedWorkoutSnapshot?
    var selectedStartMode: WorkoutMode = .normal
    var activeWorkoutMode: WorkoutMode = .normal

    var defaultRestSeconds: Int = 120
    var supersetRestSeconds: Int = 180

    /// Per-exercise record cache, keyed by Exercise.id. Built on demand when an
    /// ExerciseCard asks for records, invalidated when a set is logged/edited/deleted
    /// or when an exercise is added/replaced.
    private var recordsCache: [UUID: ExerciseRecords] = [:]

    /// Transient "just hit a record" markers, keyed by LoggedSet.id. Set when
    /// a set is logged; UI reads this to display the star + micro-celebration.
    var justHitRecord: [UUID: RecordKind] = [:]

    /// Pre-computed records for `exercise`, built from its recent finished-session
    /// history. Does NOT include sets from the currently active session.
    /// We look at the last 20 sessions for this exercise — any record set farther
    /// back than that is ancient enough to not care about.
    func records(for exercise: Exercise) -> ExerciseRecords {
        if let cached = recordsCache[exercise.id] { return cached }
        let (primary, history) = fetchRecentSets(for: exercise, maxSessions: 20)
        let all = history.flatMap { $0 } + primary
        let records = RecordsEngine.buildRecords(for: exercise, historicalSets: all)
        recordsCache[exercise.id] = records
        return records
    }

    func invalidateRecords(for exercise: Exercise?) {
        guard let exercise else { return }
        recordsCache.removeValue(forKey: exercise.id)
    }

    /// Superset linking — "armed" state for the double-tap-to-link interaction.
    /// When non-nil, the next double-tap on another exercise header will link them.
    var armedSupersetExerciseID: UUID?

    // Live workout timer
    var workoutElapsed: TimeInterval = 0
    private var workoutTimer: AnyCancellable?
    private var lastAutoBackupAt: Date?
    private var liveActivityPreviewExerciseID: UUID?
    private var liveActivityWeightDelta: Double = 0
    private var liveActivityRepsDelta: Int = 0
    private var liveActivityIntentObservers: [NSObjectProtocol] = []

    var workoutElapsedFormatted: String {
        let mins = Int(workoutElapsed) / 60
        let secs = Int(workoutElapsed) % 60
        if mins < 60 {
            return String(format: "%d:%02d", mins, secs)
        }
        return String(format: "%d:%02d:%02d", mins / 60, mins % 60, secs)
    }

    func startWorkoutTimer() {
        guard let session = activeSession else { return }
        workoutTimer?.cancel()
        workoutTimer = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self else { return }
                self.workoutElapsed = Date().timeIntervalSince(session.startTime)
            }
        workoutElapsed = Date().timeIntervalSince(session.startTime)
    }

    func stopWorkoutTimer() {
        workoutTimer?.cancel()
        workoutTimer = nil
    }

    // MARK: - Session Management

    func loadActiveSession() {
        guard let context = modelContext else { return }
        let descriptor = FetchDescriptor<WorkoutSession>(
            predicate: #Predicate { $0.isActive },
            sortBy: [SortDescriptor(\.startTime, order: .reverse)]
        )
        activeSession = try? context.fetch(descriptor).first
        if let session = activeSession {
            startWorkoutTimer()
            // App relaunched mid-workout — re-attach a Live Activity so the
            // lock screen keeps showing state instead of going dark.
            startLiveActivity(for: session)
            pushLiveActivityUpdate(restEndsAt: nil, restTotalSeconds: 0)
        }
    }

    func startEmptyWorkout(mode: WorkoutMode? = nil) {
        guard let context = modelContext else { return }
        activeWorkoutMode = mode ?? selectedStartMode
        let session = WorkoutSession()
        context.insert(session)
        seedSessionForModeIfNeeded(session, mode: activeWorkoutMode)
        try? context.save()
        activeSession = session
        startWorkoutTimer()
        startLiveActivity(for: session)
        HapticManager.impact(.heavy)
    }

    func startFromTemplate(_ template: WorkoutTemplate, mode: WorkoutMode? = nil) {
        guard let context = modelContext else { return }
        activeWorkoutMode = mode ?? selectedStartMode
        let session = WorkoutSession(template: template)
        context.insert(session)

        for (index, templateEx) in template.orderedExercises.enumerated() {
            guard let exercise = templateEx.exercise else { continue }
            let logged = LoggedExercise(orderIndex: index, exercise: exercise)
            logged.session = session
            context.insert(logged)
            session.loggedExercises.append(logged)
        }

        try? context.save()
        activeSession = session
        applyModeOverlayIfNeeded(to: session)
        startWorkoutTimer()
        startLiveActivity(for: session)
        HapticManager.impact(.heavy)
    }

    func repeatLastWorkout(mode: WorkoutMode? = nil) {
        guard let context = modelContext else { return }
        activeWorkoutMode = mode ?? selectedStartMode
        let descriptor = FetchDescriptor<WorkoutSession>(
            predicate: #Predicate { !$0.isActive },
            sortBy: [SortDescriptor(\.startTime, order: .reverse)]
        )
        guard let lastSession = try? context.fetch(descriptor).first else { return }

        let session = WorkoutSession(template: lastSession.template)
        context.insert(session)

        for (index, loggedEx) in lastSession.orderedExercises.enumerated() {
            guard let exercise = loggedEx.exercise else { continue }
            let newLogged = LoggedExercise(orderIndex: index, exercise: exercise)
            newLogged.session = session
            context.insert(newLogged)
            session.loggedExercises.append(newLogged)
        }

        try? context.save()
        activeSession = session
        applyModeOverlayIfNeeded(to: session)
        startWorkoutTimer()
        startLiveActivity(for: session)
        HapticManager.impact(.heavy)
    }

    private func seedSessionForModeIfNeeded(_ session: WorkoutSession, mode: WorkoutMode) {
        guard session.loggedExercises.isEmpty else {
            applyModeOverlayIfNeeded(to: session)
            return
        }

        switch mode {
        case .normal:
            return
        case .beast, .monk:
            let baseExercises = preferredBaseExercises(for: mode)
            seedSession(session, with: baseExercises)
            applyModeOverlayIfNeeded(to: session)
        }
    }

    private func applyModeOverlayIfNeeded(to session: WorkoutSession) {
        if activeWorkoutMode == .monk {
            appendMonkDeficitExercises(to: session, maxExtra: 2)
        } else if activeWorkoutMode == .beast, shouldExtendBeastSession() {
            appendBeastExtensionExercises(to: session, maxExtra: 1)
        }
    }

    private func seedSession(_ session: WorkoutSession, with exercises: [Exercise]) {
        guard let context = modelContext else { return }
        var seen = Set<UUID>()
        let uniqueExercises = exercises.filter { exercise in
            seen.insert(exercise.id).inserted
        }
        for (index, exercise) in uniqueExercises.enumerated() {
            let logged = LoggedExercise(orderIndex: index, exercise: exercise)
            logged.session = session
            context.insert(logged)
            session.loggedExercises.append(logged)
        }
    }

    private func preferredBaseExercises(for mode: WorkoutMode) -> [Exercise] {
        guard let context = modelContext else { return [] }

        let sessionsDescriptor = FetchDescriptor<WorkoutSession>(
            predicate: #Predicate { !$0.isActive },
            sortBy: [SortDescriptor(\.startTime, order: .reverse)]
        )
        let templatesDescriptor = FetchDescriptor<WorkoutTemplate>(
            sortBy: [SortDescriptor(\.sortOrder, order: .forward)]
        )
        let goalsDescriptor = FetchDescriptor<MuscleGoal>()

        let recentSessions = (try? context.fetch(sessionsDescriptor)) ?? []
        let templates = (try? context.fetch(templatesDescriptor)) ?? []
        let goals = (try? context.fetch(goalsDescriptor)) ?? []

        switch mode {
        case .normal:
            return []
        case .beast:
            if let recentBase = recentSessions.first?.orderedExercises.compactMap(\.exercise), !recentBase.isEmpty {
                return recentBase
            }
            if let favoriteTemplate = templates.max(by: { templateModeScore($0, for: .beast, priorities: []) < templateModeScore($1, for: .beast, priorities: []) }) {
                return favoriteTemplate.orderedExercises.compactMap(\.exercise)
            }
            return []
        case .monk:
            let priorities = EffectiveSetsEngine.rollingPriorities(sessions: recentSessions, goals: goals)
            if let bestTemplate = templates.max(by: { templateModeScore($0, for: .monk, priorities: priorities) < templateModeScore($1, for: .monk, priorities: priorities) }) {
                let chosen = bestTemplate.orderedExercises.compactMap(\.exercise)
                if !chosen.isEmpty { return chosen }
            }
            if let recentBase = recentSessions.first?.orderedExercises.compactMap(\.exercise), !recentBase.isEmpty {
                return recentBase
            }
            return []
        }
    }

    private func templateModeScore(
        _ template: WorkoutTemplate,
        for mode: WorkoutMode,
        priorities: [(MuscleParent, Double)]
    ) -> Double {
        let exercises = template.orderedExercises.compactMap(\.exercise)
        guard !exercises.isEmpty else { return 0 }

        switch mode {
        case .normal:
            return 0
        case .beast:
            return exercises.reduce(0) { score, exercise in
                score
                + (exercise.isFavorite ? 2.5 : 0)
                + (exercise.fatigueClass == .heavy ? 2.0 : 0)
                + (exercise.suggestedRestSeconds >= 150 ? 1.0 : 0)
            }
        case .monk:
            let weightMap = Dictionary(uniqueKeysWithValues: priorities.prefix(5).enumerated().map { index, pair in
                (pair.0, Double(6 - index))
            })
            return exercises.reduce(0) { score, exercise in
                let contribution = exercise.muscleMappings.reduce(0.0) { subtotal, mapping in
                    subtotal + (weightMap[mapping.muscleGroup.parent] ?? 0) * mapping.coefficient
                }
                return score + contribution
            }
        }
    }

    func finishWorkout() {
        guard let session = activeSession else { return }
        session.isActive = false
        session.endTime = Date()
        try? modelContext?.save()
        if let context = modelContext {
            maybeAutoBackup(context: context, force: true)
        }
        let sets = session.totalWorkSets
        let duration = session.durationFormatted
        let prCount = session.loggedExercises
            .flatMap(\.completedWorkSets)
            .filter { justHitRecord[$0.id] != nil }
            .count
        let progressionSignal = prCount > 0 ? "Haussier" : (sets >= 12 ? "Stable+" : "Stable")
        var muscleTotals: [MuscleParent: Double] = [:]
        for logged in session.loggedExercises {
            for (parent, value) in EffectiveSetsEngine.parentSets(for: logged) {
                muscleTotals[parent, default: 0] += value
            }
        }
        let topMuscles = muscleTotals
            .filter { $0.value > 0 }
            .sorted {
                if abs($0.value - $1.value) > 0.01 {
                    return $0.value > $1.value
                }
                return $0.key.displayName < $1.key.displayName
            }
            .prefix(3)
            .map { FinishedWorkoutSnapshot.MuscleImpact(parent: $0.key, sets: Int($0.value.rounded())) }

        let prHighlights = Array(NSOrderedSet(array: session.loggedExercises.compactMap { logged in
            guard let exercise = logged.exercise else { return nil }
            let hasDisplayedPR = !RecordsEngine.displayedRecordSetIDs(
                in: logged,
                among: logged.completedWorkSets,
                exercise: exercise
            ).isEmpty
            return hasDisplayedPR ? exercise.name : nil
        })) as? [String] ?? []
        cancelRestTimerNotifications()
        restTimer.reset()
        stopWorkoutTimer()
        endLiveActivity()
        activeSession = nil
        activeWorkoutMode = .normal
        liveActivityPreviewExerciseID = nil
        liveActivityWeightDelta = 0
        liveActivityRepsDelta = 0
        HapticManager.notification(.success)
        completedWorkoutSummary = "Séance terminée — \(sets) sets \u{2022} \(duration)"
        finishedWorkoutSnapshot = FinishedWorkoutSnapshot(
            duration: duration,
            setCount: sets,
            exerciseCount: session.loggedExercises.filter { !$0.completedWorkSets.isEmpty }.count,
            prCount: prCount,
            progressionSignal: progressionSignal,
            topMuscles: topMuscles,
            prHighlights: prHighlights
        )
    }

    func discardWorkout() {
        guard let session = activeSession, let context = modelContext else { return }
        context.delete(session)
        try? context.save()
        cancelRestTimerNotifications()
        restTimer.reset()
        stopWorkoutTimer()
        endLiveActivity()
        activeSession = nil
        activeWorkoutMode = .normal
        liveActivityPreviewExerciseID = nil
        liveActivityWeightDelta = 0
        liveActivityRepsDelta = 0
    }

    // MARK: - Rest Timer Control

    /// User tapped "skip rest" on the timer. Clears the timer, cancels the
    /// pending notification, and updates the Live Activity so the lock-screen
    /// countdown disappears immediately.
    func skipRest() {
        restTimer.reset()
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["jeera_rest_timer"])
        center.removeDeliveredNotifications(withIdentifiers: ["jeera_rest_timer"])
        pushLiveActivityUpdate(restEndsAt: nil, restTotalSeconds: 0)
        HapticManager.selection()
    }

    // MARK: - Exercise Management

    func addExercise(_ exercise: Exercise) {
        guard let session = activeSession, let context = modelContext else { return }
        let orderIndex = (session.loggedExercises.map(\.orderIndex).max() ?? -1) + 1
        let logged = LoggedExercise(orderIndex: orderIndex, exercise: exercise)
        logged.session = session
        context.insert(logged)
        session.loggedExercises.append(logged)

        exercise.lastUsed = Date()
        try? context.save()
        HapticManager.impact(.medium)
    }

    /// Replace one exercise instance with another, preserving the exact position.
    /// Called from the swipe-left "Remplacer" action.
    func replaceExercise(_ loggedExercise: LoggedExercise, with newExercise: Exercise) {
        guard let context = modelContext else { return }
        // Clear any in-progress sets for the old instance — replacing means starting fresh.
        for set in loggedExercise.sets {
            context.delete(set)
        }
        loggedExercise.sets.removeAll()
        loggedExercise.exercise = newExercise
        newExercise.lastUsed = Date()
        try? context.save()
        HapticManager.impact(.medium)
    }

    func removeExercise(_ loggedExercise: LoggedExercise) {
        guard let context = modelContext else { return }
        let exerciseName = loggedExercise.exercise?.name ?? "Exercise"

        activeSession?.loggedExercises.removeAll { $0.id == loggedExercise.id }
        context.delete(loggedExercise)

        for (i, ex) in (activeSession?.orderedExercises ?? []).enumerated() {
            ex.orderIndex = i
        }

        try? context.save()
        showUndoMessage("Removed \(exerciseName)") { }
        HapticManager.deleteSet()
    }

    func moveExercise(from source: IndexSet, to destination: Int) {
        guard let session = activeSession else { return }
        var exercises = session.orderedExercises

        // Break superset group membership for any moved exercise. The old
        // adjacency model used to smear links onto the wrong neighbour here;
        // with explicit groups we just detach the mover and let the user
        // re-pair after the reorder settles.
        for idx in source {
            guard exercises.indices.contains(idx) else { continue }
            detachFromSupersetGroup(exercises[idx])
        }

        exercises.move(fromOffsets: source, toOffset: destination)
        for (i, ex) in exercises.enumerated() {
            ex.orderIndex = i
        }
        try? modelContext?.save()
        HapticManager.reorder()
    }

    // MARK: - Superset

    /// Toggle an exercise's superset membership. If it belongs to a group
    /// already, detach it; otherwise arm this exercise for pairing.
    func toggleSuperset(_ loggedExercise: LoggedExercise) {
        if loggedExercise.supersetGroup != nil {
            detachFromSupersetGroup(loggedExercise)
            try? modelContext?.save()
            HapticManager.selection()
        } else {
            handleSupersetLink(loggedExercise)
        }
    }

    /// Right-swipe "Lier en superset" / "Retirer du superset" flow.
    ///
    /// - If the exercise is already grouped: detach it from its group.
    /// - If nothing is armed: arm this exercise — the UI shows "Superset
    ///   prêt : choisis le 2e exo" feedback.
    /// - If another exercise is already armed: join this one to the armed
    ///   exercise's group (creating the group on first pair), and move the
    ///   joining exercise to sit right after the group's tail.
    func handleSupersetLink(_ loggedExercise: LoggedExercise) {
        guard let session = activeSession, let context = modelContext else { return }

        // Detach path — exercise is already part of a group.
        if loggedExercise.supersetGroup != nil {
            detachFromSupersetGroup(loggedExercise)
            armedSupersetExerciseID = nil
            try? context.save()
            HapticManager.selection()
            return
        }

        // Nothing armed — arm this exercise.
        guard let armedID = armedSupersetExerciseID else {
            armedSupersetExerciseID = loggedExercise.id
            HapticManager.selection()
            return
        }

        // Swiping the same armed exercise again cancels arming.
        if armedID == loggedExercise.id {
            armedSupersetExerciseID = nil
            HapticManager.selection()
            return
        }

        guard let armed = session.loggedExercises.first(where: { $0.id == armedID }) else {
            armedSupersetExerciseID = nil
            return
        }

        // Ensure there's a group. If `armed` already has one, extend it;
        // otherwise create a fresh group and seat `armed` as the first member.
        let group: SupersetGroup
        if let existing = armed.supersetGroup {
            group = existing
        } else {
            let newGroup = SupersetGroup(
                orderIndex: armed.orderIndex,
                memberOrder: [armed.id],
                session: session,
                members: []
            )
            context.insert(newGroup)
            armed.supersetGroup = newGroup
            group = newGroup
        }

        // Append the new member to the group and move it to sit right after
        // the current tail of the group in the ordered session list.
        if !group.memberOrder.contains(loggedExercise.id) {
            group.memberOrder.append(loggedExercise.id)
        }
        loggedExercise.supersetGroup = group

        var ordered = session.orderedExercises
        guard let fromIdx = ordered.firstIndex(where: { $0.id == loggedExercise.id }),
              let armedIdx = ordered.firstIndex(where: { $0.id == armed.id }) else {
            armedSupersetExerciseID = nil
            return
        }

        // Walk forward through the armed exercise's existing group tail so we
        // always insert after the LAST current member, not directly after armed.
        var tailIdx = armedIdx
        while tailIdx < ordered.count - 1,
              let nextGroup = ordered[tailIdx + 1].supersetGroup,
              nextGroup.id == group.id,
              ordered[tailIdx + 1].id != loggedExercise.id {
            tailIdx += 1
        }

        let moving = ordered.remove(at: fromIdx)
        let insertAt = tailIdx < fromIdx ? tailIdx + 1 : tailIdx
        ordered.insert(moving, at: insertAt)

        for (i, ex) in ordered.enumerated() {
            ex.orderIndex = i
        }

        armedSupersetExerciseID = nil
        try? context.save()
        HapticManager.impact(.medium)
    }

    /// Legacy compatibility — routes to new swipe-based handler.
    func handleSupersetDoubleTap(_ loggedExercise: LoggedExercise) {
        handleSupersetLink(loggedExercise)
    }

    /// Remove an exercise from its superset group. If the group ends up with
    /// fewer than 2 members, the group is deleted entirely so we never leave
    /// a "singleton superset" hanging in the session.
    private func detachFromSupersetGroup(_ exercise: LoggedExercise) {
        guard let group = exercise.supersetGroup, let context = modelContext else { return }

        group.memberOrder.removeAll { $0 == exercise.id }
        group.members.removeAll { $0.id == exercise.id }
        exercise.supersetGroup = nil

        if group.memberOrder.count < 2 {
            // Unpair the lone remaining member too and delete the group.
            for remaining in group.members {
                remaining.supersetGroup = nil
            }
            group.members.removeAll()
            activeSession?.supersetGroups.removeAll { $0.id == group.id }
            context.delete(group)
        }
    }

    // MARK: - Duplicate Exercise

    /// Duplicate an exercise instance and insert it directly below the original.
    /// All following exercises shift down by one slot so ordering stays explicit.
    func duplicateExercise(_ loggedExercise: LoggedExercise) {
        guard let session = activeSession, let context = modelContext,
              let exercise = loggedExercise.exercise else { return }

        let ordered = session.orderedExercises
        guard let idx = ordered.firstIndex(where: { $0.id == loggedExercise.id }) else { return }

        // Shift every exercise after the source down by one.
        for (i, ex) in ordered.enumerated() where i > idx {
            ex.orderIndex = i + 1
        }

        let newLogged = LoggedExercise(
            orderIndex: loggedExercise.orderIndex + 1,
            exercise: exercise
        )
        newLogged.session = session
        context.insert(newLogged)
        session.loggedExercises.append(newLogged)
        try? context.save()
        HapticManager.impact(.medium)
    }

    // MARK: - Set Logging

    func logSet(for loggedExercise: LoggedExercise, weight: Double, reps: Int, setType: SetType = .work) {
        guard let context = modelContext else { return }
        liveActivityWeightDelta = 0
        liveActivityRepsDelta = 0

        // The user validated another set before the rest pause ended — cancel any
        // pending/delivered T-3 notification so it doesn't fire after they've moved on.
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["jeera_rest_timer"])
        center.removeDeliveredNotifications(withIdentifiers: ["jeera_rest_timer"])

        // Snapshot records BEFORE inserting so we can classify the new set fairly.
        let priorRecords = loggedExercise.exercise.map { records(for: $0) } ?? .empty

        // Superset round index: when the exercise is in a group, this set
        // belongs to the round the user is currently completing. Using
        // `completedRounds + 1` works whether the user logs members in strict
        // order or jumps around — each member's own work-set count determines
        // the round they personally are on.
        let roundIndex: Int? = {
            guard loggedExercise.supersetGroup != nil else { return nil }
            return loggedExercise.completedWorkSets.count + 1
        }()

        let set = LoggedSet(
            weight: weight,
            reps: reps,
            setType: setType,
            setSlotIndex: loggedExercise.nextSetSlotIndex,
            supersetRoundIndex: roundIndex
        )
        set.loggedExercise = loggedExercise
        context.insert(set)
        loggedExercise.sets.append(set)
        try? context.save()
        autoDetectSupersetIfNeeded(triggerExercise: loggedExercise)

        HapticManager.logSet()

        // Record classification — lightweight, uses the cached prior records.
        if let exercise = loggedExercise.exercise,
           let kind = RecordsEngine.classify(set: set, exercise: exercise, priorRecords: priorRecords) {
            justHitRecord[set.id] = kind
            // Bump the cache: treat this new set as part of history for future sets in the same session.
            let updatedHeaviest: Double
            let updatedReps: Int
            if weight > 0, weight > priorRecords.heaviestValidated, reps >= exercise.repTargetMin {
                updatedHeaviest = weight
                updatedReps = reps
            } else {
                updatedHeaviest = priorRecords.heaviestValidated
                updatedReps = priorRecords.repsAtHeaviestValidated
            }
            var newBestByWeight = priorRecords.bestRepsByWeight
            if weight > 0, reps >= exercise.repTargetMin, reps > (newBestByWeight[weight] ?? 0) {
                newBestByWeight[weight] = reps
            }
            let newBWReps = (weight == 0 && reps > priorRecords.bestBodyweightReps)
                ? reps : priorRecords.bestBodyweightReps
            let newE1RM: Double = {
                guard weight > 0, reps >= exercise.repTargetMin,
                      let e = ProgressionEngine.estimated1RM(weight: weight, reps: reps)
                else { return priorRecords.bestE1RM }
                return max(priorRecords.bestE1RM, e)
            }()
            let newHeaviestEver = weight > 0 ? max(priorRecords.heaviestEver, weight) : priorRecords.heaviestEver
            recordsCache[exercise.id] = ExerciseRecords(
                heaviestValidated: updatedHeaviest,
                repsAtHeaviestValidated: updatedReps,
                heaviestEver: newHeaviestEver,
                bestRepsByWeight: newBestByWeight,
                bestBodyweightReps: newBWReps,
                bestE1RM: newE1RM,
                isEmpty: false
            )
        }

        // Achievement overlay — same detection logic kept for the full-screen celebration.
        if let exercise = loggedExercise.exercise {
            let (previousSets, _) = fetchRecentSets(for: exercise, maxSessions: 3)
            if let achievement = ProgressionEngine.detectAchievement(
                exercise: exercise,
                justLogged: set,
                previousBestSets: previousSets
            ) {
                currentAchievement = achievement
                showAchievement = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                    self?.showAchievement = false
                }
            }
        }

        // Superset rest logic: if linked to next, don't start timer.
        // If this is the last exercise in a superset chain, use supersetRestSeconds.
        var restEndsAt: Date? = nil
        var restTotal = 0
        if loggedExercise.isLinkedToNext {
            // In superset chain, skip rest
        } else {
            // Check if this exercise is the end of a superset block
            let isEndOfSupersetBlock = isLastInSupersetBlock(loggedExercise)
            let restSeconds: Int
            if isEndOfSupersetBlock {
                restSeconds = supersetRestSeconds
            } else {
                restSeconds = loggedExercise.exercise?.suggestedRestSeconds ?? defaultRestSeconds
            }
            currentRestSuggested = restSeconds
            restTimer.start(seconds: restSeconds)
            scheduleRestTimerNotification(seconds: restSeconds)
            restEndsAt = Date().addingTimeInterval(TimeInterval(restSeconds))
            restTotal = restSeconds
        }

        // Lock-screen Live Activity: show the set we just logged + rest countdown.
        pushLiveActivityUpdate(
            restEndsAt: restEndsAt,
            restTotalSeconds: restTotal,
            lastLoggedSet: set,
            lastLoggedExercise: loggedExercise
        )
        if let session = activeSession {
            liveActivityPreviewExerciseID = nextExerciseInSessionContext(session: session, current: loggedExercise)?.id ?? loggedExercise.id
        }

        // Reorder after validate: move this exercise card to after the last-logged one.
        applyReorderAfterValidate(loggedExercise)
        if activeWorkoutMode == .monk {
            applyMonkFatigueAwareOrdering(after: loggedExercise)
        }

        // Best-effort cloud backup after each validated set (throttled).
        maybeAutoBackup(context: context)
    }

    // MARK: - Superset Auto Detection

    /// Auto-detect supersets directly from recent set order.
    /// Pattern examples:
    /// - 2 exercises: A -> B -> A (and optionally B again)
    /// - 3 exercises: A -> B -> C -> A
    /// - 4 exercises: A -> B -> C -> D -> A
    ///
    /// We only inspect recent completed work sets in this active session and
    /// require short time gaps to avoid linking distant blocks.
    private func autoDetectSupersetIfNeeded(triggerExercise: LoggedExercise) {
        guard let session = activeSession, let context = modelContext else { return }

        let points: [SupersetPoint] = session.loggedExercises
            .flatMap { logged in
                logged.completedWorkSets.map { SupersetPoint(exerciseID: logged.id, timestamp: $0.timestamp) }
            }
            .sorted { $0.timestamp < $1.timestamp }

        guard points.count >= 3 else { return }
        let recent = Array(points.suffix(24))
        guard let memberIDs = detectSupersetMembers(from: recent) else { return }
        guard memberIDs.contains(triggerExercise.id) else { return }

        let members = memberIDs.compactMap { id in
            session.loggedExercises.first(where: { $0.id == id })
        }
        guard members.count >= 2 else { return }

        // Already grouped in same order -> no-op.
        if let existing = members.first?.supersetGroup,
           members.allSatisfy({ $0.supersetGroup?.id == existing.id }),
           existing.memberOrder == memberIDs {
            return
        }

        // If members are already part of other groups, don't auto-override
        // those user-defined structures.
        let existingGroupIDs = Set(members.compactMap { $0.supersetGroup?.id })
        if !existingGroupIDs.isEmpty {
            if existingGroupIDs.count != 1 { return }
            if let groupID = existingGroupIDs.first,
               let onlyGroup = members.first(where: { $0.supersetGroup?.id == groupID })?.supersetGroup,
               Set(onlyGroup.memberOrder) != Set(memberIDs) {
                return
            }
        }

        // Detach only if all detected members are from one exact group or standalone.
        for member in members where member.supersetGroup != nil {
            detachFromSupersetGroup(member)
        }

        let anchorOrder = members.map(\.orderIndex).min() ?? 0
        let group = SupersetGroup(
            orderIndex: anchorOrder,
            memberOrder: memberIDs,
            session: session,
            members: []
        )
        context.insert(group)
        for member in members {
            member.supersetGroup = group
        }
        recomputeSupersetRoundIndices(for: group)
        try? context.save()
    }

    /// Return ordered member IDs for a detected 2..4-exercise superset.
    private func detectSupersetMembers(from points: [SupersetPoint]) -> [UUID]? {
        let maxGapSeconds: TimeInterval = 240
        guard points.count >= 3 else { return nil }
        let ids = points.map(\.exerciseID)

        for size in stride(from: 4, through: 2, by: -1) {
            guard ids.count >= size + 1 else { continue }
            let windowStart = max(0, ids.count - 12)
            for start in windowStart..<(ids.count - size) {
                let template = Array(ids[start..<(start + size)])
                guard Set(template).count == size else { continue }
                guard ids[start + size] == template[0] else { continue }

                // Extend while the pattern repeats.
                var end = start + size
                while end + 1 < ids.count {
                    let expected = template[(end + 1 - start) % size]
                    if ids[end + 1] != expected { break }
                    end += 1
                }

                // Must include the most recent set.
                guard end == ids.count - 1 else { continue }

                // Need at least two rounds to avoid noisy one-off alternation.
                guard (end - start + 1) >= (size * 2) else { continue }

                // Basic temporal consistency: no huge gap inside the detected run.
                var hasLargeGap = false
                if start < end {
                    for i in start..<end {
                        if points[i + 1].timestamp.timeIntervalSince(points[i].timestamp) > maxGapSeconds {
                            hasLargeGap = true
                            break
                        }
                    }
                }
                guard !hasLargeGap else { continue }
                return template
            }
        }

        return nil
    }

    /// Normalize round indexes after auto-grouping so historical sets in the
    /// current session align with a coherent "round 1, round 2, ...".
    private func recomputeSupersetRoundIndices(for group: SupersetGroup) {
        let membersByID = Dictionary(uniqueKeysWithValues: group.orderedMembers.map { ($0.id, $0) })
        let order = group.memberOrder.compactMap { membersByID[$0] }
        guard !order.isEmpty else { return }

        var counters: [UUID: Int] = [:]
        for member in order {
            counters[member.id] = 0
        }

        let timeline = order
            .flatMap { ex in ex.completedWorkSets.map { (ex.id, $0) } }
            .sorted { $0.1.timestamp < $1.1.timestamp }

        for (exerciseID, set) in timeline {
            let next = (counters[exerciseID] ?? 0) + 1
            counters[exerciseID] = next
            set.supersetRoundIndex = next
        }
    }

    private func maybeAutoBackup(context: ModelContext, force: Bool = false) {
        let now = Date()
        if !force, let last = lastAutoBackupAt, now.timeIntervalSince(last) < 120 {
            return
        }
        BackupSyncService.backupIfLocalIsNewer(context: context)
        lastAutoBackupAt = now
    }

    /// Check if this exercise is the last in a superset block. With explicit
    /// groups the answer is direct: the exercise is in a group AND is the
    /// tail member of that group.
    private func isLastInSupersetBlock(_ loggedExercise: LoggedExercise) -> Bool {
        return loggedExercise.isLastInSuperset
    }

    // MARK: - Reorder After Validate

    /// After validating a set, move this exercise card to immediately after the
    /// last exercise that has logged work (excluding itself). If the exercise is
    /// inside a superset block, do nothing — keep the block intact.
    private func applyReorderAfterValidate(_ loggedExercise: LoggedExercise) {
        guard let session = activeSession else { return }
        let ordered = session.orderedExercises

        // Don't reorder if inside a superset block.
        if loggedExercise.isLinkedToNext { return }
        if let idx = ordered.firstIndex(where: { $0.id == loggedExercise.id }), idx > 0 {
            if ordered[idx - 1].isLinkedToNext { return }
        }

        // Find the anchor: last exercise (other than this one) that has at least one completed set.
        guard let anchorIdx = ordered.lastIndex(where: {
            $0.id != loggedExercise.id && !$0.completedWorkSets.isEmpty
        }) else { return }

        guard let myIdx = ordered.firstIndex(where: { $0.id == loggedExercise.id }) else { return }

        // Already in position or ahead of anchor — no move needed.
        if myIdx <= anchorIdx + 1 { return }

        // Walk past any superset chain attached to the anchor.
        var insertAfter = anchorIdx
        while insertAfter < ordered.count - 1 && ordered[insertAfter].isLinkedToNext {
            insertAfter += 1
        }

        // If we're already right after the chain, nothing to do.
        if myIdx == insertAfter + 1 { return }

        // Perform the move.
        var mutable = ordered
        let moving = mutable.remove(at: myIdx)
        let newInsert = insertAfter < myIdx ? insertAfter + 1 : insertAfter
        mutable.insert(moving, at: newInsert)

        for (i, ex) in mutable.enumerated() {
            ex.orderIndex = i
        }
        try? modelContext?.save()
    }

    /// Monk mode ordering: after validating a set, try to place a "less-fatigued"
    /// candidate right after the current exercise by avoiding dominant parent
    /// muscles used in the last 2 performed exercises.
    private func applyMonkFatigueAwareOrdering(after loggedExercise: LoggedExercise) {
        guard let session = activeSession else { return }
        var ordered = session.orderedExercises
        guard let currentIdx = ordered.firstIndex(where: { $0.id == loggedExercise.id }) else { return }

        let recent = ordered
            .filter { !$0.completedWorkSets.isEmpty }
            .sorted {
                ($0.completedWorkSets.last?.timestamp ?? .distantPast) >
                ($1.completedWorkSets.last?.timestamp ?? .distantPast)
            }
        let fatiguedParents = Set(recent.prefix(2).compactMap { dominantParent(for: $0.exercise) })

        let candidateIdx = ordered.enumerated().first { idx, ex in
            guard idx > currentIdx else { return false }
            guard ex.id != loggedExercise.id else { return false }
            guard ex.supersetGroup == nil else { return false }
            guard let parent = dominantParent(for: ex.exercise) else { return false }
            return !fatiguedParents.contains(parent)
        }?.offset

        guard let fromIdx = candidateIdx, fromIdx > currentIdx + 1 else { return }
        let moving = ordered.remove(at: fromIdx)
        ordered.insert(moving, at: currentIdx + 1)
        for (i, ex) in ordered.enumerated() {
            ex.orderIndex = i
        }
        try? modelContext?.save()
    }

    private func dominantParent(for exercise: Exercise?) -> MuscleParent? {
        guard let exercise else { return nil }
        return exercise.muscleMappings.max(by: { $0.coefficient < $1.coefficient })?.muscleGroup.parent
    }

    // MARK: - Rest Timer Notification (T-3)

    /// Schedule a local notification 3 seconds before the rest timer ends.
    /// This wakes the lock screen so the user can see the timer finishing.
    private func scheduleRestTimerNotification(seconds: Int) {
        let fireIn = max(0, seconds - 3)
        let center = UNUserNotificationCenter.current()
        center.removeDeliveredNotifications(withIdentifiers: ["jeera_rest_timer"])
        center.removePendingNotificationRequests(withIdentifiers: ["jeera_rest_timer"])

        let content = UNMutableNotificationContent()
        content.title = "Repos terminé"
        content.body = "C'est reparti 💪"
        content.sound = .default
        content.interruptionLevel = .timeSensitive

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: Double(max(1, fireIn)), repeats: false)
        let request = UNNotificationRequest(identifier: "jeera_rest_timer", content: content, trigger: trigger)
        center.add(request, withCompletionHandler: nil)
    }

    func editSet(_ set: LoggedSet, weight: Double, reps: Int) {
        set.weight = weight
        set.reps = reps
        try? modelContext?.save()
        // Editing can invalidate what counts as a record for this exercise.
        invalidateRecords(for: set.loggedExercise?.exercise)
        justHitRecord.removeValue(forKey: set.id)
        HapticManager.selection()
    }

    func deleteSet(_ set: LoggedSet, from loggedExercise: LoggedExercise) {
        guard let context = modelContext else { return }
        let weight = set.weight
        let reps = set.reps

        loggedExercise.sets.removeAll { $0.id == set.id }
        justHitRecord.removeValue(forKey: set.id)
        context.delete(set)
        try? context.save()
        invalidateRecords(for: loggedExercise.exercise)

        showUndoMessage("Set supprimé — \(weight > 0 ? weight.cleanWeight : "BW")x\(reps)") { }
        HapticManager.deleteSet()
    }

    // MARK: - Suggestion (multi-session context)

    func suggestion(for loggedExercise: LoggedExercise) -> SetSuggestion {
        guard let exercise = loggedExercise.exercise else {
            return SetSuggestion(weight: 20, reps: 10, setType: .work, explanation: "No exercise data")
        }

        let (primarySets, recentHistory) = fetchRecentSets(for: exercise, maxSessions: 3)
        let currentSetIndex = loggedExercise.completedWorkSets.count

        var suggestion = ProgressionEngine.suggest(
            for: exercise,
            previousSets: primarySets,
            currentSetIndex: currentSetIndex,
            recentHistory: recentHistory,
            currentSessionSets: loggedExercise.completedWorkSets
        )

        if activeWorkoutMode == .beast,
           currentSetIndex == 1,
           suggestion.weight > 0,
           suggestion.mode != .fallbackHypertrophy {
            let bump = max(1, exercise.smallestIncrement)
            let bumpedReps = suggestion.mode == .plateauBreak
                ? suggestion.reps
                : max(exercise.repTargetMin, suggestion.reps - 1)
            suggestion = SetSuggestion(
                weight: suggestion.weight + bump,
                reps: bumpedReps,
                setType: suggestion.setType,
                explanation: "Beast mode: \(suggestion.explanation)",
                confidence: suggestion.confidence,
                reasonCodes: suggestion.reasonCodes + ["beast_mode_weight_bias"],
                mode: suggestion.mode
            )
        }
        return suggestion
    }

    /// Fetch last N sessions for this exercise. Returns (mostRecent, [olderSessions]).
    func fetchRecentSets(for exercise: Exercise, maxSessions: Int = 3) -> ([LoggedSet], [[LoggedSet]]) {
        guard let context = modelContext else { return ([], []) }

        let descriptor = FetchDescriptor<WorkoutSession>(
            predicate: #Predicate { !$0.isActive },
            sortBy: [SortDescriptor(\.startTime, order: .reverse)]
        )

        guard let sessions = try? context.fetch(descriptor) else { return ([], []) }

        let exerciseId = exercise.id
        var found: [[LoggedSet]] = []

        for session in sessions {
            for logged in session.loggedExercises {
                if logged.exercise?.id == exerciseId {
                    found.append(logged.workSets)
                    if found.count >= maxSessions { break }
                }
            }
            if found.count >= maxSessions { break }
        }

        guard !found.isEmpty else { return ([], []) }
        let primary = found[0]
        let history = Array(found.dropFirst())
        return (primary, history)
    }

    // MARK: - Undo

    private func showUndoMessage(_ message: String, action: @escaping () -> Void) {
        undoMessage = message
        undoAction = action
        showUndo = true

        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.showUndo = false
        }
    }

    private func appendMonkDeficitExercises(to session: WorkoutSession, maxExtra: Int) {
        guard let context = modelContext, maxExtra > 0 else { return }
        let sessionsDescriptor = FetchDescriptor<WorkoutSession>(
            predicate: #Predicate { !$0.isActive },
            sortBy: [SortDescriptor(\.startTime, order: .reverse)]
        )
        let goalsDescriptor = FetchDescriptor<MuscleGoal>()
        let exercisesDescriptor = FetchDescriptor<Exercise>()

        guard let finishedSessions = try? context.fetch(sessionsDescriptor),
              let goals = try? context.fetch(goalsDescriptor),
              let allExercises = try? context.fetch(exercisesDescriptor) else { return }

        let priorities = EffectiveSetsEngine.rollingPriorities(sessions: finishedSessions, goals: goals)
        let targetParents = Set(priorities.prefix(3).map(\.0))
        if targetParents.isEmpty { return }

        let existingExerciseIDs = Set(session.loggedExercises.compactMap { $0.exercise?.id })
        var candidates = allExercises.filter { ex in
            !existingExerciseIDs.contains(ex.id) &&
            ex.muscleMappings.contains { targetParents.contains($0.muscleGroup.parent) && $0.coefficient >= 0.3 }
        }
        candidates.sort { a, b in
            let aScore = a.muscleMappings.filter { targetParents.contains($0.muscleGroup.parent) }.map(\.coefficient).reduce(0, +)
            let bScore = b.muscleMappings.filter { targetParents.contains($0.muscleGroup.parent) }.map(\.coefficient).reduce(0, +)
            return aScore > bScore
        }

        let startIndex = (session.orderedExercises.map(\.orderIndex).max() ?? -1) + 1
        for (offset, exercise) in candidates.prefix(maxExtra).enumerated() {
            let logged = LoggedExercise(orderIndex: startIndex + offset, exercise: exercise)
            logged.session = session
            context.insert(logged)
            session.loggedExercises.append(logged)
        }
        try? context.save()
    }

    private func shouldExtendBeastSession() -> Bool {
        guard let context = modelContext else { return false }
        let descriptor = FetchDescriptor<RecoveryCheckin>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        guard let recent = try? context.fetch(descriptor), !recent.isEmpty else { return false }
        let window = Array(recent.prefix(2))
        let avgSleep = window.reduce(0.0) { $0 + $1.sleepHours } / Double(window.count)
        let adherence = window.filter { $0.tookCreatine || $0.proteinTargetMet }.count
        return avgSleep >= 7.0 && adherence >= 1
    }

    private func appendBeastExtensionExercises(to session: WorkoutSession, maxExtra: Int) {
        guard let context = modelContext, maxExtra > 0 else { return }
        let descriptor = FetchDescriptor<Exercise>()
        guard let allExercises = try? context.fetch(descriptor) else { return }

        let existingExerciseIDs = Set(session.loggedExercises.compactMap { $0.exercise?.id })
        let sessionCategories = Set(session.loggedExercises.compactMap { $0.exercise?.category }.filter { !$0.isEmpty })
        let sessionParents = Set(
            session.loggedExercises
                .compactMap(\.exercise)
                .flatMap { exercise in
                    exercise.muscleMappings.map { $0.muscleGroup.parent }
                }
        )

        let candidates = allExercises.filter { ex in
            !existingExerciseIDs.contains(ex.id) &&
            (ex.isFavorite || ex.fatigueClass == .heavy || ex.suggestedRestSeconds >= 150)
        }
        .sorted { a, b in
            let aScore =
                (a.isFavorite ? 2.5 : 0)
                + (a.fatigueClass == .heavy ? 2.0 : 0)
                + (a.suggestedRestSeconds >= 150 ? 1.0 : 0)
                + (sessionCategories.contains(a.category) ? 1.5 : 0)
                + (a.muscleMappings.contains { sessionParents.contains($0.muscleGroup.parent) && $0.coefficient >= 0.3 } ? 1.5 : 0)
            let bScore =
                (b.isFavorite ? 2.5 : 0)
                + (b.fatigueClass == .heavy ? 2.0 : 0)
                + (b.suggestedRestSeconds >= 150 ? 1.0 : 0)
                + (sessionCategories.contains(b.category) ? 1.5 : 0)
                + (b.muscleMappings.contains { sessionParents.contains($0.muscleGroup.parent) && $0.coefficient >= 0.3 } ? 1.5 : 0)
            return aScore > bScore
        }

        let startIndex = (session.orderedExercises.map(\.orderIndex).max() ?? -1) + 1
        for (offset, exercise) in candidates.prefix(maxExtra).enumerated() {
            let logged = LoggedExercise(orderIndex: startIndex + offset, exercise: exercise)
            logged.session = session
            context.insert(logged)
            session.loggedExercises.append(logged)
        }
        try? context.save()
    }

    // MARK: - Templates

    func saveAsTemplate(name: String) {
        guard let session = activeSession, let context = modelContext else { return }
        let template = WorkoutTemplate(name: name)
        context.insert(template)

        for loggedEx in session.orderedExercises {
            guard let exercise = loggedEx.exercise else { continue }
            let templateEx = TemplateExercise(orderIndex: loggedEx.orderIndex, exercise: exercise, targetSets: max(loggedEx.workSets.count, 3))
            context.insert(templateEx)
            template.templateExercises.append(templateEx)
        }

        try? context.save()
        HapticManager.notification(.success)
    }

    // MARK: - Live Activity

    /// Start (or restart) the lock-screen Live Activity for the given session.
    /// Idempotent — the controller ends any stale activity before starting a new
    /// one, so calling this on app relaunch doesn't create duplicates.
    private func startLiveActivity(for session: WorkoutSession) {
        let firstExo = session.orderedExercises.first
        let firstExoName = firstExo?.exercise?.name ?? "Entraînement"

        // Compute the first suggestion so the lock screen already shows what's coming.
        let (nextName, nextPreview) = nextSetInfo(for: session, afterExercise: nil)

        Task { @MainActor in
            LiveActivityController.shared.start(
                workoutID: session.id,
                exerciseName: firstExoName,
                workoutStartedAt: session.startTime,
                nextExerciseName: nextName,
                nextSetPreview: nextPreview
            )
        }
    }

    /// Push the current session state to the active Live Activity.
    /// Pass `lastLoggedSet`/`lastLoggedExercise` when called from `logSet` so the
    /// lock screen shows the just-validated set (e.g. "80 kg × 8").
    private func pushLiveActivityUpdate(
        restEndsAt: Date?,
        restTotalSeconds: Int,
        lastLoggedSet: LoggedSet? = nil,
        lastLoggedExercise: LoggedExercise? = nil
    ) {
        guard let session = activeSession else { return }

        let exerciseName: String = {
            if let ex = lastLoggedExercise?.exercise { return ex.name }
            if let next = session.orderedExercises.first(where: { $0.workSets.isEmpty }),
               let name = next.exercise?.name {
                return name
            }
            return session.orderedExercises.first?.exercise?.name ?? "Entraînement"
        }()

        let lastSummary: String = {
            guard let set = lastLoggedSet else { return "" }
            if set.weight > 0 {
                return "\(set.weight.cleanWeight) kg × \(set.reps)"
            }
            return "BW × \(set.reps)"
        }()

        let (nextName, nextPreview) = nextSetInfo(for: session, afterExercise: lastLoggedExercise)

        let state = WorkoutContentState(
            exerciseName: exerciseName,
            lastSetSummary: lastSummary,
            restEndsAt: restEndsAt,
            restTotalSeconds: restTotalSeconds,
            workoutStartedAt: session.startTime,
            nextExerciseName: nextName,
            nextSetPreview: nextPreview
        )

        Task { @MainActor in
            LiveActivityController.shared.update(state: state)
        }
    }

    /// Compute the (exerciseName, "W kg × R") pair for the NEXT set the user
    /// is about to do. Usually the same exercise (next slot), sometimes the
    /// next card if all slots for the current exercise are done.
    private func nextSetInfo(for session: WorkoutSession, afterExercise: LoggedExercise?) -> (String, String) {
        // Find the "next" exercise: the one the user should log next.
        let ordered = session.orderedExercises
        let target: LoggedExercise? = {
            if let previewID = liveActivityPreviewExerciseID,
               let preview = ordered.first(where: { $0.id == previewID }) {
                return preview
            }
            if let current = afterExercise {
                return nextExerciseInSessionContext(session: session, current: current) ?? current
            }
            // No last exercise: pick the first one that still has work to do.
            return ordered.first
        }()

        guard let exo = target, let exercise = exo.exercise else {
            return ("", "")
        }

        let sug = suggestion(for: exo)
        let adjustedWeight = max(0, sug.weight + liveActivityWeightDelta)
        let adjustedReps = max(1, sug.reps + liveActivityRepsDelta)
        let preview: String
        if adjustedWeight > 0 {
            preview = "\(adjustedWeight.cleanWeight) kg × \(adjustedReps)"
        } else {
            preview = "BW × \(adjustedReps)"
        }
        return (exercise.name, preview)
    }

    private func resolvedLiveActivityTarget(in session: WorkoutSession) -> LoggedExercise? {
        let ordered = session.orderedExercises
        guard !ordered.isEmpty else { return nil }

        if let previewID = liveActivityPreviewExerciseID,
           let preview = ordered.first(where: { $0.id == previewID }) {
            return preview
        }

        if let activeSupersetMember = ordered.first(where: { exercise in
            guard let group = exercise.supersetGroup else { return false }
            let members = group.orderedMembers
            let counts = members.map(\.completedWorkSets.count)
            let minCount = counts.min() ?? 0
            let maxCount = counts.max() ?? 0
            return maxCount - minCount > 0 && exercise.completedWorkSets.count == minCount
        }) {
            return activeSupersetMember
        }

        if let nextUnstarted = ordered.first(where: { $0.completedWorkSets.isEmpty }) {
            return nextUnstarted
        }

        return ordered.first
    }

    /// End the Live Activity. Called on finish/discard.
    private func endLiveActivity() {
        Task { @MainActor in
            LiveActivityController.shared.end()
        }
    }

    // MARK: - Live Activity Intent Observers

    /// Call this once at setup so the ViewModel reacts to lock-screen button taps.
    func observeLiveActivityIntents() {
        guard liveActivityIntentObservers.isEmpty else { return }
        let validateObserver = NotificationCenter.default.addObserver(
            forName: .jeeraValidateNextSet,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleValidateFromLiveActivity()
        }

        let skipObserver = NotificationCenter.default.addObserver(
            forName: .jeeraSkipRestFromLiveActivity,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.skipRest()
        }

        let nextObserver = NotificationCenter.default.addObserver(
            forName: .jeeraNextExerciseFromLiveActivity,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleNextExerciseFromLiveActivity()
        }

        let incWeightObserver = NotificationCenter.default.addObserver(
            forName: .jeeraIncreaseWeightFromLiveActivity,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.adjustLiveActivityPreview(weightDelta: 1, repsDelta: 0)
        }

        let decWeightObserver = NotificationCenter.default.addObserver(
            forName: .jeeraDecreaseWeightFromLiveActivity,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.adjustLiveActivityPreview(weightDelta: -1, repsDelta: 0)
        }

        let incRepsObserver = NotificationCenter.default.addObserver(
            forName: .jeeraIncreaseRepsFromLiveActivity,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.adjustLiveActivityPreview(weightDelta: 0, repsDelta: 1)
        }

        let decRepsObserver = NotificationCenter.default.addObserver(
            forName: .jeeraDecreaseRepsFromLiveActivity,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.adjustLiveActivityPreview(weightDelta: 0, repsDelta: -1)
        }

        liveActivityIntentObservers = [
            validateObserver,
            skipObserver,
            nextObserver,
            incWeightObserver,
            decWeightObserver,
            incRepsObserver,
            decRepsObserver
        ]
    }

    /// "Valider" tapped on the lock screen — log the suggested set for the
    /// next pending exercise, exactly as if the user had tapped "Valider" in
    /// the ExerciseCard.
    private func handleValidateFromLiveActivity() {
        guard let session = activeSession else { return }
        guard let exo = resolvedLiveActivityTarget(in: session) else { return }
        let sug = suggestion(for: exo)
        let adjustedWeight = max(0, sug.weight + liveActivityWeightDelta)
        let adjustedReps = max(1, sug.reps + liveActivityRepsDelta)
        liveActivityWeightDelta = 0
        liveActivityRepsDelta = 0
        logSet(for: exo, weight: adjustedWeight, reps: adjustedReps, setType: sug.setType)
    }

    private func handleNextExerciseFromLiveActivity() {
        guard let session = activeSession else { return }
        guard let current = resolvedLiveActivityTarget(in: session) else { return }

        if let next = nextExerciseInSessionContext(session: session, current: current) {
            liveActivityPreviewExerciseID = next.id
            liveActivityWeightDelta = 0
            liveActivityRepsDelta = 0
            let restEndsAt: Date? = restTimer.isRunning
                ? Date().addingTimeInterval(max(0, Double(restTimer.targetSeconds) - restTimer.elapsed))
                : nil
            pushLiveActivityUpdate(restEndsAt: restEndsAt, restTotalSeconds: currentRestSuggested)
        }
    }

    private func nextExerciseInSessionContext(session: WorkoutSession, current: LoggedExercise?) -> LoggedExercise? {
        let ordered = session.orderedExercises
        guard !ordered.isEmpty else { return nil }
        guard let current else { return ordered.first }

        if let group = current.supersetGroup {
            let members = group.orderedMembers
            if let memberIdx = members.firstIndex(where: { $0.id == current.id }), memberIdx + 1 < members.count {
                return members[memberIdx + 1]
            }
            if !members.isEmpty {
                let counts = members.map { ($0, $0.completedWorkSets.count) }
                let minCount = counts.map(\.1).min() ?? 0
                if let candidate = counts.first(where: { $0.1 == minCount })?.0 {
                    return candidate
                }
            }
            return members.first ?? ordered.first
        }

        if let idx = ordered.firstIndex(where: { $0.id == current.id }), idx + 1 < ordered.count {
            return ordered[idx + 1]
        }
        return ordered.first
    }

    private func adjustLiveActivityPreview(weightDelta: Double, repsDelta: Int) {
        guard activeSession != nil else { return }
        liveActivityWeightDelta += weightDelta
        liveActivityRepsDelta += repsDelta
        if liveActivityWeightDelta < -200 { liveActivityWeightDelta = -200 }
        if liveActivityRepsDelta < -30 { liveActivityRepsDelta = -30 }

        let restEndsAt: Date? = restTimer.isRunning
            ? Date().addingTimeInterval(max(0, Double(restTimer.targetSeconds) - restTimer.elapsed))
            : nil
        pushLiveActivityUpdate(restEndsAt: restEndsAt, restTotalSeconds: currentRestSuggested)
    }

    private func cancelRestTimerNotifications() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["jeera_rest_timer"])
        center.removeDeliveredNotifications(withIdentifiers: ["jeera_rest_timer"])
    }

    deinit {
        let center = NotificationCenter.default
        for observer in liveActivityIntentObservers {
            center.removeObserver(observer)
        }
        liveActivityIntentObservers.removeAll()
    }
}
