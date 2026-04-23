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
    @Namespace private var selectionNamespace

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
                        isSelected: selectedExercise?.id == exercise.id,
                        namespace: selectionNamespace
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
    let namespace: Namespace.ID
    @State private var showCurveExplanation = false
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

    private var latestPoint: ExerciseDataPoint? {
        history.last
    }

    private var recentAverage7Plus: Double? {
        let values = history.suffix(4).map(\.bestWeightAt7Plus).filter { $0 > 0 }
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +) / Double(values.count)
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
        if lastValue < prevValue - 0.01 { return .down }
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
        case "Crunch décliné", "Crunch déclinés":
            return 29...76
        case "Relevé jambe chaise roumaine", "Relevé de jambes chaise romaine":
            return 18...46
        default:
            return nil
        }
    }

    var body: some View {
        GlassCard(padding: 16, cornerRadius: 20) {
            VStack(spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(exercise.name)
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)

                        trendBadge
                    }

                    Spacer()

                    Image(systemName: isSelected ? "chevron.up" : "chevron.down")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.tertiary)
                }

                collapsedPreviewStrip

                // Expanded chart
                if isSelected {
                    Divider().background(.white.opacity(0.08))

                    if history.count >= 2 {
                        VStack(alignment: .leading, spacing: 10) {
                            chartHeader
                            exerciseChart
                        }
                        if showsSecondaryRepChart {
                            chartBlock {
                                repChartForWeightedBodyweight
                            }
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
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(isSelected ? exerciseTint.opacity(0.35) : .white.opacity(0.03), lineWidth: 1)
        }
        .background {
            if isSelected {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [exerciseTint.opacity(0.10), .clear],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .matchedGeometryEffect(id: "exercise-progress-selection", in: namespace)
            }
        }
    }

    // MARK: - Chart with proper scaling

    private var chartHeader: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(exercise.setPatternMode == .bodyweight ? "Courbe reps" : "Meilleure charge 7+")
                .font(.system(size: 10).weight(.medium))
                .foregroundStyle(.secondary)

            if exercise.setPatternMode != .bodyweight {
                Button {
                    showCurveExplanation.toggle()
                } label: {
                    Image(systemName: "info.circle")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showCurveExplanation, arrowEdge: .top) {
                    Text("Courbe = meilleur perf 7+ reps sur les 4 dernières séances de cet exo")
                        .font(.caption)
                        .padding(10)
                        .presentationCompactAdaptation(.popover)
                }
            }

            Spacer()
        }
    }

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

        return VStack(alignment: .leading, spacing: 4) {
            Chart {
                ForEach(chartData, id: \.0) { date, value, isValidated in
                    if isValidated {
                        LineMark(
                            x: .value("Date", date),
                            y: .value(isBodyweight ? "Reps" : "Weight", value)
                        )
                        .foregroundStyle(Color.accentColor)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                        .interpolationMethod(.linear)

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
                            .interpolationMethod(.linear)
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
        let recent = history.suffix(1).reversed()
        return VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(recent), id: \.date) { dp in
                HStack {
                    Text(dp.date.shortDate)
                        .font(.caption2.weight(.medium))
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

    private var collapsedPreviewStrip: some View {
        HStack(spacing: 8) {
            statChip("Dernier", value: latestDisplay, tint: .white.opacity(0.9))
            if let band = benchmarkDisplay {
                statChip("Zone", value: band, tint: .green)
            }
            statChip(metricTitle, value: metricValue, tint: trendTint)
        }
    }

    private func statChip(_ title: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(tint)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private func chartBlock<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            content()
        }
        .padding(12)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.white.opacity(0.06), lineWidth: 0.8)
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

    private var latestDisplay: String {
        guard let latestPoint else { return "--" }
        if exercise.setPatternMode == .bodyweight {
            return "BW x \(latestPoint.bestBWReps)"
        }
        if latestPoint.bestWeightAt7Plus > 0 {
            return "\(latestPoint.bestWeightAt7Plus.cleanWeight) kg"
        }
        return latestPoint.topSetSummary
    }

    private var benchmarkDisplay: String? {
        if exercise.setPatternMode == .bodyweight, let band = repBenchmarkRange {
            return "\(Int(band.lowerBound))-\(Int(band.upperBound)) reps"
        }
        if let low = exercise.benchmarkLow, let high = exercise.benchmarkHigh {
            return "\(low.cleanWeight)-\(high.cleanWeight) kg"
        }
        return nil
    }

    private var trendLabel: String {
        switch trend {
        case .up: return "Hausse"
        case .down: return "Baisse"
        case .neutral: return "Stable"
        }
    }

    private var metricTitle: String {
        exercise.setPatternMode == .bodyweight ? "Tendance" : "4 sé."
    }

    private var metricValue: String {
        if exercise.setPatternMode == .bodyweight {
            return trendLabel
        }
        if let avg = recentAverage7Plus {
            return "\(avg.cleanWeight) kg"
        }
        return trendLabel
    }

    private var trendTint: Color {
        switch trend {
        case .up: return .green
        case .down: return .orange
        case .neutral: return .secondary
        }
    }

    private var exerciseTint: Color {
        if exercise.setPatternMode == .bodyweight {
            return .orange
        }
        return benchmarkDisplay == nil ? .blue : .green
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
