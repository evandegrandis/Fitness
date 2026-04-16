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
        if let session = activeSession {
            startWorkoutTimer()
            // App relaunched mid-workout — re-attach a Live Activity so the
            // lock screen keeps showing state instead of going dark.
            startLiveActivity(for: session)
            pushLiveActivityUpdate(restEndsAt: nil, restTotalSeconds: 0)
        }
    }

    func startEmptyWorkout() {
        guard let context = modelContext else { return }
        let session = WorkoutSession()
        context.insert(session)
        try? context.save()
        activeSession = session
        startWorkoutTimer()
        startLiveActivity(for: session)
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
        startLiveActivity(for: session)
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
        startLiveActivity(for: session)
        HapticManager.impact(.heavy)
    }

    func finishWorkout() {
        guard let session = activeSession else { return }
        session.isActive = false
        session.endTime = Date()
        try? modelContext?.save()
        restTimer.reset()
        stopWorkoutTimer()
        endLiveActivity()
        activeSession = nil
        HapticManager.notification(.success)
    }

    func discardWorkout() {
        guard let session = activeSession, let context = modelContext else { return }
        context.delete(session)
        try? context.save()
        restTimer.reset()
        stopWorkoutTimer()
        endLiveActivity()
        activeSession = nil
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
                members: [armed]
            )
            context.insert(newGroup)
            armed.supersetGroup = newGroup
            session.supersetGroups.append(newGroup)
            group = newGroup
        }

        // Append the new member to the group and move it to sit right after
        // the current tail of the group in the ordered session list.
        if !group.memberOrder.contains(loggedExercise.id) {
            group.memberOrder.append(loggedExercise.id)
        }
        loggedExercise.supersetGroup = group
        if !group.members.contains(where: { $0.id == loggedExercise.id }) {
            group.members.append(loggedExercise)
        }

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
            recordsCache[exercise.id] = ExerciseRecords(
                heaviestValidated: updatedHeaviest,
                repsAtHeaviestValidated: updatedReps,
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

        // Reorder after validate: move this exercise card to after the last-logged one.
        applyReorderAfterValidate(loggedExercise)
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
            if let current = afterExercise {
                // If the exercise is in a superset and is linked-to-next, the
                // next set is on the NEXT superset member, not the same exo.
                if current.isLinkedToNext,
                   let idx = ordered.firstIndex(where: { $0.id == current.id }),
                   idx + 1 < ordered.count {
                    return ordered[idx + 1]
                }
                // Otherwise keep logging on the same exercise unless it's "done".
                return current
            }
            // No last exercise: pick the first one that still has work to do.
            return ordered.first
        }()

        guard let exo = target, let exercise = exo.exercise else {
            return ("", "")
        }

        let sug = suggestion(for: exo)
        let preview: String
        if sug.weight > 0 {
            preview = "\(sug.weight.cleanWeight) kg × \(sug.reps)"
        } else {
            preview = "BW × \(sug.reps)"
        }
        return (exercise.name, preview)
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
        NotificationCenter.default.addObserver(
            forName: .jeeraValidateNextSet,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleValidateFromLiveActivity()
        }

        NotificationCenter.default.addObserver(
            forName: .jeeraSkipRestFromLiveActivity,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.skipRest()
        }
    }

    /// "Valider" tapped on the lock screen — log the suggested set for the
    /// next pending exercise, exactly as if the user had tapped "Valider" in
    /// the ExerciseCard.
    private func handleValidateFromLiveActivity() {
        guard let session = activeSession else { return }
        let ordered = session.orderedExercises

        // Find the exercise the user should validate next.
        // If the rest timer is running, the "next" is the exercise we just
        // logged to (still has slots) or the following one.
        let target: LoggedExercise? = {
            // Try: first exercise that still has fewer work sets than the
            // typical target (3), preferring earlier orderIndex.
            if let current = ordered.first(where: { logEx in
                guard let ex = logEx.exercise else { return false }
                let done = logEx.completedWorkSets.count
                let targetSets = max(3, ex.repTargetMax > 0 ? 3 : 3)
                return done < targetSets
            }) {
                return current
            }
            // Fall back to the first exercise entirely.
            return ordered.first
        }()

        guard let exo = target else { return }

        let sug = suggestion(for: exo)
        logSet(for: exo, weight: sug.weight, reps: sug.reps, setType: sug.setType)
    }
}
