import Foundation
import SwiftData
import SwiftUI
import Combine
import UserNotifications

@Observable
class WorkoutViewModel {
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
        if activeSession != nil {
            startWorkoutTimer()
        }
    }

    func startEmptyWorkout() {
        guard let context = modelContext else { return }
        let session = WorkoutSession()
        context.insert(session)
        try? context.save()
        activeSession = session
        startWorkoutTimer()
        HapticManager.impact(.heavy)
    }

    func startFromTemplate(_ template: WorkoutTemplate) {
        guard let context = modelContext else { return }
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
        startWorkoutTimer()
        HapticManager.impact(.heavy)
    }

    func repeatLastWorkout() {
        guard let context = modelContext else { return }
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
        startWorkoutTimer()
        HapticManager.impact(.heavy)
    }

    func finishWorkout() {
        guard let session = activeSession else { return }
        session.isActive = false
        session.endTime = Date()
        try? modelContext?.save()
        restTimer.reset()
        stopWorkoutTimer()
        activeSession = nil
        HapticManager.notification(.success)
    }

    func discardWorkout() {
        guard let session = activeSession, let context = modelContext else { return }
        context.delete(session)
        try? context.save()
        restTimer.reset()
        stopWorkoutTimer()
        activeSession = nil
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

        // Break superset links that the move would otherwise smear onto the wrong
        // neighbours. Conservative rule: any link *touching* a moved exercise is
        // cleared on both sides, and the user can re-arm the link after if needed.
        //   - the moved exercise's own isLinkedToNext (its "next" is about to change)
        //   - the predecessor's isLinkedToNext (its link pointed at the moved exo)
        for idx in source {
            guard exercises.indices.contains(idx) else { continue }
            exercises[idx].isLinkedToNext = false
            if idx > 0 {
                exercises[idx - 1].isLinkedToNext = false
            }
        }

        exercises.move(fromOffsets: source, toOffset: destination)
        for (i, ex) in exercises.enumerated() {
            ex.orderIndex = i
        }
        try? modelContext?.save()
        HapticManager.reorder()
    }

    // MARK: - Superset

    func toggleSuperset(_ loggedExercise: LoggedExercise) {
        loggedExercise.isLinkedToNext.toggle()
        try? modelContext?.save()
        HapticManager.selection()
    }

    /// Right-swipe "Lier en superset" / "Retirer du superset" flow.
    ///
    /// - If already linked: unlink (set `isLinkedToNext = false`).
    /// - If nothing is armed: arm this exercise — UI shows "Superset prêt :
    ///   choisis le 2e exo" feedback.
    /// - If another exercise is already armed: link the armed exercise to this
    ///   one (move this exercise right after the armed, set armed.isLinkedToNext).
    func handleSupersetLink(_ loggedExercise: LoggedExercise) {
        guard let session = activeSession else { return }

        // Unlink an already-linked exercise.
        if loggedExercise.isLinkedToNext {
            loggedExercise.isLinkedToNext = false
            armedSupersetExerciseID = nil
            try? modelContext?.save()
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

        // Link: armed → this. Move `loggedExercise` to sit right after the armed one.
        guard let armed = session.loggedExercises.first(where: { $0.id == armedID }) else {
            armedSupersetExerciseID = nil
            return
        }

        var ordered = session.orderedExercises
        guard let fromIdx = ordered.firstIndex(where: { $0.id == loggedExercise.id }),
              let armedIdx = ordered.firstIndex(where: { $0.id == armed.id }) else {
            armedSupersetExerciseID = nil
            return
        }

        let moving = ordered.remove(at: fromIdx)
        let insertAt = armedIdx < fromIdx ? armedIdx + 1 : armedIdx
        ordered.insert(moving, at: insertAt)

        for (i, ex) in ordered.enumerated() {
            ex.orderIndex = i
        }
        armed.isLinkedToNext = true
        armedSupersetExerciseID = nil
        try? modelContext?.save()
        HapticManager.impact(.medium)
    }

    /// Legacy compatibility — routes to new swipe-based handler.
    func handleSupersetDoubleTap(_ loggedExercise: LoggedExercise) {
        handleSupersetLink(loggedExercise)
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

        // The user validated another set before the rest pause ended — cancel any
        // pending/delivered T-3 notification so it doesn't fire after they've moved on.
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["jeera_rest_timer"])
        center.removeDeliveredNotifications(withIdentifiers: ["jeera_rest_timer"])

        // Snapshot records BEFORE inserting so we can classify the new set fairly.
        let priorRecords = loggedExercise.exercise.map { records(for: $0) } ?? .empty

        let set = LoggedSet(
            weight: weight,
            reps: reps,
            setType: setType,
            setSlotIndex: loggedExercise.nextSetSlotIndex
        )
        set.loggedExercise = loggedExercise
        context.insert(set)
        loggedExercise.sets.append(set)
        try? context.save()

        HapticManager.logSet()

        // Record classification — lightweight, uses the cached prior records.
        if let exercise = loggedExercise.exercise,
           let kind = RecordsEngine.classify(set: set, exercise: exercise, priorRecords: priorRecords) {
            justHitRecord[set.id] = kind
            // Bump the cache: treat this new set as part of history for future sets in the same session.
            let updatedHeaviest: Double
            let updatedReps: Int
            if kind == .heaviestWeight || weight > priorRecords.heaviestValidated {
                updatedHeaviest = weight
                updatedReps = reps
            } else {
                updatedHeaviest = priorRecords.heaviestValidated
                updatedReps = priorRecords.repsAtHeaviestValidated
            }
            var newBestByWeight = priorRecords.bestRepsByWeight
            if reps > (newBestByWeight[weight] ?? 0) {
                newBestByWeight[weight] = reps
            }
            recordsCache[exercise.id] = ExerciseRecords(
                heaviestValidated: updatedHeaviest,
                repsAtHeaviestValidated: updatedReps,
                bestRepsByWeight: newBestByWeight,
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
        }

        // Reorder after validate: move this exercise card to after the last-logged one.
        applyReorderAfterValidate(loggedExercise)
    }

    /// Check if this exercise is the last in a superset block (i.e., a previous exercise links to it)
    private func isLastInSupersetBlock(_ loggedExercise: LoggedExercise) -> Bool {
        guard let session = activeSession else { return false }
        let exercises = session.orderedExercises
        guard let index = exercises.firstIndex(where: { $0.id == loggedExercise.id }), index > 0 else { return false }
        return exercises[index - 1].isLinkedToNext
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

        return ProgressionEngine.suggest(
            for: exercise,
            previousSets: primarySets,
            currentSetIndex: currentSetIndex,
            recentHistory: recentHistory
        )
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
}
