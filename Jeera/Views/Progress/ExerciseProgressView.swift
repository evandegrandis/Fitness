import SwiftUI
import SwiftData
import Charts

struct ExerciseProgressView: View {
    private enum SortMode: String, CaseIterable, Identifiable {
        case deficit
        case completion
        case alphabetical

        var id: String { rawValue }

        var label: String {
            switch self {
            case .deficit: return "Déficit"
            case .completion: return "Complétion"
            case .alphabetical: return "A-Z"
            }
        }
    }

    @Query(sort: \Exercise.name) private var exercises: [Exercise]
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var sessions: [WorkoutSession]
    @State private var selectedExercise: Exercise?
    @AppStorage("exercise_progress_sort_mode") private var sortModeRawValue = SortMode.deficit.rawValue
    @Namespace private var selectionNamespace

    private var sortMode: SortMode {
        get { SortMode(rawValue: sortModeRawValue) ?? .deficit }
        nonmutating set { sortModeRawValue = newValue.rawValue }
    }

    private struct ExerciseSortMetric {
        let current: Double?
        let target: Double?

        var deficit: Double {
            guard let current, let target else { return -.greatestFiniteMagnitude }
            return max(0, target - current)
        }

        var completion: Double {
            guard let current, let target, target > 0 else { return -.greatestFiniteMagnitude }
            return current / target
        }
    }

    private var usedExercises: [Exercise] {
        let used = exercises.filter { ex in
            sessions.contains { session in
                session.loggedExercises.contains { $0.exercise?.id == ex.id }
            }
        }

        switch sortMode {
        case .alphabetical:
            return used.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        case .deficit:
            return used.sorted {
                let a = sortMetric(for: $0)
                let b = sortMetric(for: $1)
                if abs(a.deficit - b.deficit) > 0.001 {
                    return a.deficit > b.deficit
                }
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }

        case .completion:
            return used.sorted {
                let a = sortMetric(for: $0)
                let b = sortMetric(for: $1)
                if abs(a.completion - b.completion) > 0.001 {
                    return a.completion > b.completion
                }
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                sortControl
                    .padding(.horizontal)

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

    private var sortControl: some View {
        HStack(spacing: 8) {
            Text("Trier")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            ForEach(SortMode.allCases) { mode in
                Button {
                    withAnimation(.spring(response: 0.26, dampingFraction: 0.88)) {
                        sortMode = mode
                    }
                } label: {
                    Text(mode.label)
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(sortMode == mode ? .primary : .secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(
                            Capsule()
                                .fill(sortMode == mode ? Color.white.opacity(0.10) : Color.white.opacity(0.04))
                        )
                        .overlay {
                            Capsule()
                                .stroke(sortMode == mode ? .white.opacity(0.12) : .white.opacity(0.05), lineWidth: 0.8)
                        }
                }
                .buttonStyle(.plain)
            }

            Spacer()
        }
    }

    private func sortMetric(for exercise: Exercise) -> ExerciseSortMetric {
        let history = sessions.compactMap { session -> ExerciseDataPoint? in
            guard let logged = session.loggedExercises.first(where: { $0.exercise?.id == exercise.id }) else {
                return nil
            }
            let workSets = logged.completedWorkSets
            guard !workSets.isEmpty else { return nil }

            let validatedSets = workSets.filter { $0.reps >= exercise.repTargetMin }
            let bestValidated = validatedSets.max(by: { $0.weight < $1.weight })
            let benchmarkSets = workSets.filter { $0.reps >= 7 }
            let bestWeightAt7Plus = benchmarkSets.map(\.weight).max() ?? 0
            let bestBWReps = workSets.map(\.reps).max() ?? 0

            return ExerciseDataPoint(
                date: session.date,
                validatedWeight: bestValidated?.weight ?? 0,
                validatedReps: bestValidated?.reps ?? 0,
                bestE1RM: 0,
                bestWeightAt7Plus: bestWeightAt7Plus,
                bestBWReps: bestBWReps,
                topSetSummary: "",
                isBodyweight: exercise.setPatternMode == .bodyweight
            )
        }
        .sorted { $0.date < $1.date }

        guard let latest = history.last else {
            return ExerciseSortMetric(current: nil, target: nil)
        }

        let hasWeightedHistory = sessions.contains { session in
            session.loggedExercises.contains { logged in
                logged.exercise?.id == exercise.id &&
                logged.completedWorkSets.contains(where: { $0.weight > 0 })
            }
        }

        let usesRepMetric = exercise.setPatternMode == .bodyweight || !hasWeightedHistory
        let current = usesRepMetric ? Double(latest.bestBWReps) : latest.bestWeightAt7Plus
        let target = exercise.benchmarkLow

        return ExerciseSortMetric(current: current > 0 ? current : nil, target: target)
    }
}

// MARK: - Exercise Progress Row

struct ExerciseProgressRow: View {
    let exercise: Exercise
    let sessions: [WorkoutSession]
    var isSelected: Bool = false
    let namespace: Namespace.ID
    private let rollingWindowSessions = 4
    @AppStorage("user_body_weight_kg") private var userBodyWeightKg = 78.0

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
            let bestE1RM = bestEstimatedOneRM(from: workSets)
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

    private var recentEstimatedOneRM: Double? {
        let recentLogged = sessions
            .compactMap { session in
                session.loggedExercises.first(where: { $0.exercise?.id == exercise.id })
            }
            .prefix(3)

        let secondSetCandidates = recentLogged.compactMap { logged in
            logged.completedWorkSets.first(where: { $0.setSlotIndex == 1 })
        }
        .compactMap { estimatedOneRM(for: $0) }

        if let bestSecondSet = secondSetCandidates.max() {
            return bestSecondSet
        }

        let allCandidates = recentLogged
            .flatMap(\.completedWorkSets)
            .compactMap { estimatedOneRM(for: $0) }

        return allCandidates.max()
    }

    private var hasWeightedHistory: Bool {
        sessions.contains { session in
            session.loggedExercises.contains { logged in
                logged.exercise?.id == exercise.id &&
                logged.completedWorkSets.contains(where: { $0.weight > 0 })
            }
        }
    }

    private var usesPrimaryRepChart: Bool {
        exercise.setPatternMode == .bodyweight || !hasWeightedHistory
    }

    private var showsSecondaryRepChart: Bool {
        !usesPrimaryRepChart &&
        (exercise.setPatternMode == .weightedBodyweight || repBenchmarkRange != nil)
    }

    /// Rep benchmark band from the exercise model (low = beginner, high = elite).
    private var repBenchmarkRange: ClosedRange<Double>? {
        guard let low = exercise.benchmarkLow, let high = exercise.benchmarkHigh, low < high else {
            return nil
        }
        return low...high
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

                        if isSelected {
                            headerMetaRow
                        }
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
                            Text("Dernière séance :")
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
            Text(usesPrimaryRepChart ? "Courbe reps" : "Meilleure charge 7+")
                .font(.system(size: 10).weight(.medium))
                .foregroundStyle(.secondary)

            Spacer()
        }
    }

    private var exerciseChart: some View {
        let isBodyweight = usesPrimaryRepChart

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
            statChip("e1RM", value: e1rmDisplay, tint: .orange)
            if let best = bestDisplay {
                statChip("Best", value: best, tint: .green)
            }
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

    private var headerMetaRow: some View {
        HStack(spacing: 6) {
            if let band = benchmarkBandLabel {
                miniMetaPill(band, tint: .green)
            }
            if let pr = bestDisplay {
                miniMetaPill("PR \(pr)", tint: .orange)
            }
        }
    }

    private func miniMetaPill(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.10), in: Capsule())
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

    private var latestDisplay: String {
        guard let latestPoint else { return "--" }
        if usesPrimaryRepChart {
            return "BW x \(latestPoint.bestBWReps)"
        }
        if latestPoint.bestWeightAt7Plus > 0 {
            return "\(latestPoint.bestWeightAt7Plus.cleanWeight) kg"
        }
        return latestPoint.topSetSummary
    }

    private var e1rmDisplay: String {
        guard hasWeightedHistory || exercise.setPatternMode == .weightedBodyweight,
              let displayedOneRM = recentEstimatedOneRM ?? bestValidated?.bestE1RM,
              displayedOneRM > 0 else { return "--" }
        return "\(Int(displayedOneRM.rounded())) kg"
    }

    private var bestDisplay: String? {
        guard let bestValidated else { return nil }
        if exercise.setPatternMode == .bodyweight {
            return "BW x \(bestValidated.bestBWReps)"
        }
        if bestValidated.validatedWeight > 0, bestValidated.validatedReps > 0 {
            return "\(bestValidated.validatedWeight.cleanWeight)x\(bestValidated.validatedReps)"
        }
        return nil
    }

    private var benchmarkBandLabel: String? {
        if let low = exercise.benchmarkLow, let high = exercise.benchmarkHigh {
            return "\(low.cleanWeight)-\(high.cleanWeight) kg"
        }
        if let repRange = repBenchmarkRange {
            return "\(Int(repRange.lowerBound))-\(Int(repRange.upperBound)) reps"
        }
        return nil
    }

    private var exerciseTint: Color {
        if exercise.setPatternMode == .bodyweight {
            return .orange
        }
        return exercise.benchmarkLow == nil ? .blue : .green
    }

    private func estimatedOneRM(for set: LoggedSet) -> Double? {
        guard set.completed, set.reps > 0, set.reps <= 15 else { return nil }

        switch exercise.setPatternMode {
        case .weightedBodyweight:
            let totalLoad = max(0, userBodyWeightKg + set.weight)
            guard let totalOneRM = ProgressionEngine.estimated1RM(weight: totalLoad, reps: set.reps) else { return nil }
            return max(0, totalOneRM - userBodyWeightKg)
        case .assistedBodyweight:
            return nil
        default:
            return ProgressionEngine.estimated1RM(weight: set.weight, reps: set.reps)
        }
    }

    private func bestEstimatedOneRM(from sets: [LoggedSet]) -> Double {
        sets.compactMap { estimatedOneRM(for: $0) }.max() ?? 0
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
