import Foundation
import SwiftData
import SwiftUI
import Combine

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
        let orderIndex = session.loggedExercises.count
        let logged = LoggedExercise(orderIndex: orderIndex, exercise: exercise)
        logged.session = session
        context.insert(logged)
        session.loggedExercises.append(logged)

        exercise.lastUsed = Date()
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
        exercises.move(fromOffsets: source, toOffset: destination)
        for (i, ex) in exercises.enumerated() {
            ex.orderIndex = i
        }
        try? modelContext?.save()
        HapticManager.reorder()
    }

    // MARK: - Superset Toggle

    func toggleSuperset(_ loggedExercise: LoggedExercise) {
        loggedExercise.isLinkedToNext.toggle()
        try? modelContext?.save()
        HapticManager.selection()
    }

    // MARK: - Duplicate Exercise

    func duplicateExercise(_ loggedExercise: LoggedExercise) {
        guard let session = activeSession, let context = modelContext,
              let exercise = loggedExercise.exercise else { return }
        let orderIndex = session.loggedExercises.count
        let newLogged = LoggedExercise(orderIndex: orderIndex, exercise: exercise)
        newLogged.session = session
        context.insert(newLogged)
        session.loggedExercises.append(newLogged)
        try? context.save()
        HapticManager.impact(.medium)
    }

    // MARK: - Set Logging

    func logSet(for loggedExercise: LoggedExercise, weight: Double, reps: Int, setType: SetType = .work) {
        guard let context = modelContext else { return }
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

        // Achievement detection
        if let exercise = loggedExercise.exercise {
            let (previousSets, _) = fetchRecentSets(for: exercise, maxSessions: 3)
            if let achievement = ProgressionEngine.detectAchievement(
                exercise: exercise,
                justLogged: set,
                previousBestSets: previousSets
            ) {
                currentAchievement = achievement
                showAchievement = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
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
            if isEndOfSupersetBlock {
                currentRestSuggested = supersetRestSeconds
                restTimer.start(seconds: supersetRestSeconds)
            } else {
                let restSeconds = loggedExercise.exercise?.suggestedRestSeconds ?? defaultRestSeconds
                currentRestSuggested = restSeconds
                restTimer.start(seconds: restSeconds)
            }
        }
    }

    /// Check if this exercise is the last in a superset block (i.e., a previous exercise links to it)
    private func isLastInSupersetBlock(_ loggedExercise: LoggedExercise) -> Bool {
        guard let session = activeSession else { return false }
        let exercises = session.orderedExercises
        guard let index = exercises.firstIndex(where: { $0.id == loggedExercise.id }), index > 0 else { return false }
        return exercises[index - 1].isLinkedToNext
    }

    func editSet(_ set: LoggedSet, weight: Double, reps: Int) {
        set.weight = weight
        set.reps = reps
        try? modelContext?.save()
        HapticManager.selection()
    }

    func deleteSet(_ set: LoggedSet, from loggedExercise: LoggedExercise) {
        guard let context = modelContext else { return }
        let weight = set.weight
        let reps = set.reps

        loggedExercise.sets.removeAll { $0.id == set.id }
        context.delete(set)
        try? context.save()

        showUndoMessage("Deleted \(weight > 0 ? weight.cleanWeight : "BW")x\(reps)") { }
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
