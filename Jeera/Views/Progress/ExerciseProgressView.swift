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
    private let rollingWindowSessions = 4

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

            // Chart metric = heaviest weight moved for >=7 reps that session.
            // This plots the same unit (kg) as the benchmark band, so "am I inside
            // the green zone?" is a direct visual read. e1RM stays as a text
            // metric next to the exercise name — not the curve.
            let benchmarkSets = workSets.filter { $0.reps >= 7 }
            let bestWeightAt7Plus = benchmarkSets.map(\.weight).max() ?? 0
            let bestE1RM = ProgressionEngine.bestE1RM(from: workSets)?.e1rm ?? 0
            let bestBWReps = workSets.map(\.reps).max() ?? 0

            return ExerciseDataPoint(
                date: session.date,
                validatedWeight: bestValidated?.weight ?? 0,
                validatedReps: bestValidated?.reps ?? 0,
                bestE1RM: bestE1RM,
                bestWeightAt7Plus: bestWeightAt7Plus,
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

    // Trend: compare last 2 points of the same rolling-best curve as the chart.
    private var trend: Trend {
        guard history.count >= 2 else { return .neutral }
        let isBW = exercise.setPatternMode == .bodyweight
        let rawValues = history.map { dp in
            isBW ? Double(dp.bestBWReps) : dp.bestWeightAt7Plus
        }
        let rolling = rollingBestSeries(values: rawValues)
        let lastValue = rolling[rolling.count - 1]
        let prevValue = rolling[rolling.count - 2]
        if lastValue > prevValue + 0.01 { return .up }
        return .neutral
    }

    private var showsSecondaryRepChart: Bool {
        exercise.setPatternMode != .bodyweight &&
        (exercise.setPatternMode == .weightedBodyweight || repBenchmarkRange != nil)
    }

    /// Exercise-specific rep benchmark bands requested by user.
    private var repBenchmarkRange: ClosedRange<Double>? {
        switch exercise.name {
        case "Tractions SN":
            return 14...33
        case "Crunch décliné":
            return 29...76
        case "Relevé jambe chaise roumaine":
            return 18...46
        default:
            return nil
        }
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
                        if showsSecondaryRepChart {
                            repChartForWeightedBodyweight
                        }
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

        // Rolling "best so far in the last N sessions for this exercise".
        // With N=4 this stays mostly flat/up while still allowing rare drops
        // when an old PR ages out of the short recent window.
        let rawValues = history.map { dp in
            isBodyweight ? Double(dp.bestBWReps) : dp.bestWeightAt7Plus
        }
        let rolling = rollingBestSeries(values: rawValues)
        let chartData: [(Date, Double, Bool)] = zip(history, rolling).map { pair in
            let (dp, value) = pair
            return (dp.date, value, value > 0)
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

            if !isBodyweight, let low = exercise.benchmarkLow, let high = exercise.benchmarkHigh {
                RuleMark(y: .value("Bench Low", low))
                    .foregroundStyle(.green.opacity(0.25))
                    .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3, 3]))
                    .annotation(position: .trailing, alignment: .leading) {
                        Text("1 an")
                            .font(.system(size: 7).weight(.medium))
                            .foregroundStyle(.green.opacity(0.6))
                    }
                RuleMark(y: .value("Bench High", high))
                    .foregroundStyle(.green.opacity(0.25))
                    .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3, 3]))
                    .annotation(position: .trailing, alignment: .leading) {
                        Text("5 ans")
                            .font(.system(size: 7).weight(.medium))
                            .foregroundStyle(.green.opacity(0.6))
                    }
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

    private var repChartForWeightedBodyweight: some View {
        let rawReps = history.map { Double($0.bestBWReps) }
        let rolling = rollingBestSeries(values: rawReps)
        let chartData: [(Date, Double, Bool)] = zip(history, rolling).map { pair in
            let (dp, value) = pair
            return (dp.date, value, value > 0)
        }
        var vals = chartData.filter(\.2).map(\.1)
        if let band = repBenchmarkRange {
            vals.append(band.lowerBound)
            vals.append(band.upperBound)
        }
        let minVal = vals.min() ?? 0
        let maxVal = vals.max() ?? 12
        let padding = max((maxVal - minVal) * 0.2, 1)
        let yMin = max(0, minVal - padding)
        let yMax = maxVal + padding

        return VStack(alignment: .leading, spacing: 4) {
            Text("Reps perf (max 4 dernières séances)")
                .font(.system(size: 10).weight(.medium))
                .foregroundStyle(.secondary)
            Chart {
                if let band = repBenchmarkRange {
                    RectangleMark(
                        yStart: .value("Rep Bench Low", band.lowerBound),
                        yEnd: .value("Rep Bench High", band.upperBound)
                    )
                    .foregroundStyle(.green.opacity(0.08))

                    RuleMark(y: .value("Rep Bench Low", band.lowerBound))
                        .foregroundStyle(.green.opacity(0.25))
                        .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3, 3]))
                    RuleMark(y: .value("Rep Bench High", band.upperBound))
                        .foregroundStyle(.green.opacity(0.25))
                        .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3, 3]))
                }

                ForEach(chartData, id: \.0) { date, value, hasData in
                    if hasData {
                        LineMark(x: .value("Date", date), y: .value("Reps", value))
                            .foregroundStyle(.orange)
                            .lineStyle(StrokeStyle(lineWidth: 2))
                            .interpolationMethod(.catmullRom)
                        PointMark(x: .value("Date", date), y: .value("Reps", value))
                            .foregroundStyle(.orange)
                            .symbolSize(22)
                    }
                }
            }
            .chartYScale(domain: yMin...yMax)
            .frame(height: 90)
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks { _ in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 0.3))
                        .foregroundStyle(.white.opacity(0.08))
                    AxisValueLabel().font(.system(size: 9))
                }
            }
        }
        .padding(.top, 2)
    }

    private func rollingBestSeries(values: [Double]) -> [Double] {
        values.indices.map { idx in
            let start = max(0, idx - (rollingWindowSessions - 1))
            let window = values[start...idx]
            return window.max() ?? 0
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
    /// Best Epley e1RM across all completed work sets — shown as text only,
    /// never as the chart curve (would mix units vs benchmark kg).
    let bestE1RM: Double
    /// Heaviest weight moved for >=7 reps in this session — the primary chart
    /// metric for weighted exercises, directly comparable to the benchmark band.
    let bestWeightAt7Plus: Double
    /// Best reps across all completed work sets — used for bodyweight exercises.
    let bestBWReps: Int
    let topSetSummary: String
    let isBodyweight: Bool
}

enum Trend {
    case up, down, neutral
}
