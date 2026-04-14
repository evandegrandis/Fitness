import SwiftUI
import SwiftData
import Charts

struct ExerciseProgressView: View {
    @Query(sort: \Exercise.name) private var exercises: [Exercise]
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var sessions: [WorkoutSession]
    @State private var selectedExercise: Exercise?

    private var usedExercises: [Exercise] {
        exercises.filter { ex in
            sessions.contains { session in
                session.loggedExercises.contains { $0.exercise?.id == ex.id }
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ForEach(usedExercises) { exercise in
                    ExerciseProgressRow(
                        exercise: exercise,
                        sessions: sessions,
                        isSelected: selectedExercise?.id == exercise.id
                    )
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3)) {
                            if selectedExercise?.id == exercise.id {
                                selectedExercise = nil
                            } else {
                                selectedExercise = exercise
                                HapticManager.selection()
                            }
                        }
                    }
                    .padding(.horizontal)
                }

                if usedExercises.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "dumbbell")
                            .font(.largeTitle)
                            .foregroundStyle(.tertiary)
                        Text("Pas encore d'historique")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 60)
                }

                Spacer(minLength: 80)
            }
            .padding(.top, 12)
        }
    }
}

// MARK: - Exercise Progress Row

struct ExerciseProgressRow: View {
    let exercise: Exercise
    let sessions: [WorkoutSession]
    var isSelected: Bool = false

    private var history: [ExerciseDataPoint] {
        sessions.compactMap { session in
            guard let logged = session.loggedExercises.first(where: { $0.exercise?.id == exercise.id }) else {
                return nil
            }
            let workSets = logged.completedWorkSets
            guard !workSets.isEmpty else { return nil }

            // Find best validated set (within rep range = validated)
            let validatedSets = workSets.filter {
                $0.reps >= exercise.repTargetMin
            }

            let bestValidated = validatedSets.max(by: { $0.weight < $1.weight })

            // Session effort metric that doesn't punish "heavier for fewer reps":
            //   - weighted: best Epley e1RM across all work sets (weight × reps capped at 15)
            //   - bodyweight: best reps across all BW sets
            // This fixes the flat-curve bug when a session trades reps for load
            // (e.g. 40x10 → 50x9 → 55x8 is progress, not regression).
            let bestE1RM = ProgressionEngine.bestE1RM(from: workSets)?.e1rm ?? 0
            let bestBWReps = workSets.map(\.reps).max() ?? 0

            return ExerciseDataPoint(
                date: session.date,
                validatedWeight: bestValidated?.weight ?? 0,
                validatedReps: bestValidated?.reps ?? 0,
                bestE1RM: bestE1RM,
                bestBWReps: bestBWReps,
                topSetSummary: workSets.map { "\($0.weight.cleanWeight)x\($0.reps)" }.joined(separator: ", "),
                isBodyweight: exercise.setPatternMode == .bodyweight
            )
        }
        .sorted { $0.date < $1.date }
    }

    // Best validated ever
    private var bestValidated: ExerciseDataPoint? {
        history.max(by: { $0.validatedWeight < $1.validatedWeight })
    }

    // Best e1RM across all history
    private var bestEstimated1RM: Double? {
        let allSets = sessions.flatMap { session in
            session.loggedExercises
                .filter { $0.exercise?.id == exercise.id }
                .flatMap { $0.completedWorkSets }
        }
        return ProgressionEngine.bestE1RM(from: allSets)?.e1rm
    }

    // Trend: compare last 2 sessions using the same effort metric as the chart
    // (best e1RM for weighted, best reps for bodyweight). This avoids "flat/down"
    // readings when a session swapped reps for load.
    private var trend: Trend {
        guard history.count >= 2 else { return .neutral }
        let last = history[history.count - 1]
        let prev = history[history.count - 2]
        let isBW = exercise.setPatternMode == .bodyweight
        let lastValue = isBW ? Double(last.bestBWReps) : last.bestE1RM
        let prevValue = isBW ? Double(prev.bestBWReps) : prev.bestE1RM
        if lastValue > prevValue + 0.01 { return .up }
        if lastValue < prevValue - 0.01 { return .down }
        return .neutral
    }

    var body: some View {
        GlassCard(padding: 14, cornerRadius: 16) {
            VStack(spacing: 8) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(exercise.name)
                            .font(.subheadline.weight(.semibold))

                        HStack(spacing: 6) {
                            if let best = bestValidated, best.validatedWeight > 0 {
                                Text("Best: \(best.validatedWeight.cleanWeight)x\(best.validatedReps)")
                                    .font(.caption2.weight(.medium).monospacedDigit())
                                    .foregroundStyle(Color.accentColor)
                            } else if let best = bestValidated, best.isBodyweight {
                                Text("Best: BWx\(best.validatedReps)")
                                    .font(.caption2.weight(.medium).monospacedDigit())
                                    .foregroundStyle(Color.accentColor)
                            }

                            if let e1rm = bestEstimated1RM, exercise.setPatternMode != .bodyweight {
                                Text("e1RM \(Int(e1rm))kg")
                                    .font(.caption2.weight(.medium).monospacedDigit())
                                    .foregroundStyle(.orange)
                            }

                            trendBadge
                        }
                    }

                    Spacer()

                    HStack(spacing: 6) {
                        Text("\(history.count)")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.tertiary)
                        Image(systemName: isSelected ? "chevron.up" : "chevron.down")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }

                // Expanded chart
                if isSelected {
                    Divider().background(.white.opacity(0.08))

                    if history.count >= 2 {
                        exerciseChart
                    } else if let only = history.first {
                        // Sparse data: show milestone instead of chart
                        HStack {
                            Text("Last session:")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(only.topSetSummary)
                                .font(.caption2.weight(.medium).monospacedDigit())
                            Spacer()
                        }
                        .padding(.vertical, 8)
                    }

                    // Recent sessions summary
                    if !history.isEmpty {
                        recentSummary
                    }
                }
            }
        }
    }

    // MARK: - Chart with proper scaling

    private var exerciseChart: some View {
        let isBodyweight = exercise.setPatternMode == .bodyweight

        // Use the session's best effort metric (e1RM for weighted, best reps for BW).
        // This gives a fair curve even when a session trades reps for load.
        let chartData: [(Date, Double, Bool)] = history.map { dp in
            if isBodyweight {
                return (dp.date, Double(dp.bestBWReps), dp.bestBWReps > 0)
            } else {
                return (dp.date, dp.bestE1RM, dp.bestE1RM > 0)
            }
        }

        // Tight y-axis domain (not starting at 0), include benchmark range if present
        var values = chartData.filter(\.2).map(\.1)
        if !isBodyweight {
            if let low = exercise.benchmarkLow { values.append(low) }
            if let high = exercise.benchmarkHigh { values.append(high) }
        }
        let minVal = values.min() ?? 0
        let maxVal = values.max() ?? 100
        let padding = max((maxVal - minVal) * 0.15, isBodyweight ? 2 : 5)
        let yMin = max(0, minVal - padding)
        let yMax = maxVal + padding

        return Chart {
            ForEach(chartData, id: \.0) { date, value, isValidated in
                if isValidated {
                    LineMark(
                        x: .value("Date", date),
                        y: .value(isBodyweight ? "Reps" : "Weight", value)
                    )
                    .foregroundStyle(Color.accentColor)
                    .lineStyle(StrokeStyle(lineWidth: 2))
                    .interpolationMethod(.catmullRom)

                    PointMark(
                        x: .value("Date", date),
                        y: .value(isBodyweight ? "Reps" : "Weight", value)
                    )
                    .foregroundStyle(Color.accentColor)
                    .symbolSize(24)
                }
            }

            // Benchmark band (shaded area between low and high reference values)
            if !isBodyweight, let low = exercise.benchmarkLow, let high = exercise.benchmarkHigh {
                RuleMark(y: .value("Bench Low", low))
                    .foregroundStyle(.green.opacity(0.25))
                    .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3, 3]))
                RuleMark(y: .value("Bench High", high))
                    .foregroundStyle(.green.opacity(0.25))
                    .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3, 3]))
                RectangleMark(
                    yStart: .value("Low", low),
                    yEnd: .value("High", high)
                )
                .foregroundStyle(.green.opacity(0.06))
            }
        }
        .chartYScale(domain: yMin...yMax)
        .frame(height: 130)
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        Text(date.shortDate)
                            .font(.system(size: 9))
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks { _ in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.3))
                    .foregroundStyle(.white.opacity(0.08))
                AxisValueLabel()
                    .font(.system(size: 9))
            }
        }
    }

    // MARK: - Recent Summary

    private var recentSummary: some View {
        let recent = history.suffix(3).reversed()
        return VStack(spacing: 4) {
            ForEach(Array(recent), id: \.date) { dp in
                HStack {
                    Text(dp.date.shortDate)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .frame(width: 46, alignment: .leading)
                    Text(dp.topSetSummary)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer()
                }
            }
        }
    }

    // MARK: - Trend Badge

    @ViewBuilder
    private var trendBadge: some View {
        switch trend {
        case .up:
            HStack(spacing: 1) {
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 8).weight(.bold))
                Text("Up")
                    .font(.system(size: 9).weight(.semibold))
            }
            .foregroundStyle(.green)
        case .down:
            HStack(spacing: 1) {
                Image(systemName: "arrow.down.right")
                    .font(.system(size: 8).weight(.bold))
                Text("Down")
                    .font(.system(size: 9).weight(.semibold))
            }
            .foregroundStyle(.orange)
        case .neutral:
            EmptyView()
        }
    }
}

// MARK: - Data Models

struct ExerciseDataPoint {
    let date: Date
    let validatedWeight: Double
    let validatedReps: Int
    /// Best Epley e1RM across all completed work sets — the primary chart metric.
    let bestE1RM: Double
    /// Best reps across all completed work sets — used for bodyweight exercises.
    let bestBWReps: Int
    let topSetSummary: String
    let isBodyweight: Bool
}

enum Trend {
    case up, down, neutral
}
