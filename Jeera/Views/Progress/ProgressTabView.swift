import SwiftUI
import SwiftData
import Charts

struct ProgressTabView: View {
    @State private var selectedLayer = 0
    @Namespace private var layerNamespace

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundGradient()

                VStack(spacing: 0) {
                    ProgressLayerSwitcher(selectedLayer: $selectedLayer, namespace: layerNamespace)
                    .padding(.horizontal)
                    .padding(.top, 8)

                    TabView(selection: $selectedLayer) {
                        MuscleProgressView()
                            .tag(0)

                        ExerciseProgressView()
                            .tag(1)

                        GlobalProgressView()
                            .tag(2)
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .animation(.spring(response: 0.42, dampingFraction: 0.84), value: selectedLayer)
                }
            }
            .navigationTitle("Progrès")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct ProgressLayerSwitcher: View {
    @Binding var selectedLayer: Int
    let namespace: Namespace.ID

    private let items: [(Int, String, String)] = [
        (0, "Muscles", "figure.strengthtraining.traditional"),
        (1, "Exercices", "dumbbell.fill"),
        (2, "Global", "waveform.path.ecg")
    ]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(items, id: \.0) { item in
                let isSelected = selectedLayer == item.0
                Button {
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.84)) {
                        selectedLayer = item.0
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: item.2)
                            .font(.caption.weight(.bold))
                        Text(item.1)
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundStyle(isSelected ? .black : .white.opacity(0.82))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(isSelected ? Color.white.opacity(0.92) : Color.white.opacity(0.05))
                            .matchedGeometryEffect(id: isSelected ? "progress-layer-pill" : item.1, in: namespace)
                    }
                }
                .buttonStyle(LiftButtonStyle(scale: 0.985))
            }
        }
        .padding(5)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(.white.opacity(0.08), lineWidth: 1)
        }
    }
}

private struct GlobalProgressView: View {
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime
    ) private var sessions: [WorkoutSession]
    @Query(sort: \RecoveryCheckin.date) private var checkins: [RecoveryCheckin]

    private enum SecondaryMetric: String, CaseIterable, Identifiable {
        case creatine
        case protein
        case sleep

        var id: String { rawValue }

        var title: String {
            switch self {
            case .creatine: return "Créatine"
            case .protein: return "Protéine"
            case .sleep: return "Sommeil"
            }
        }

        var shortTitle: String {
            switch self {
            case .creatine: return "Créa"
            case .protein: return "Prot"
            case .sleep: return "Som."
            }
        }

        var color: Color {
            switch self {
            case .creatine: return .green
            case .protein: return .blue
            case .sleep: return .mint
            }
        }
    }

    @State private var selectedWeek: Date?

    private struct WeeklyPoint: Identifiable {
        let id = UUID()
        let weekStart: Date
        let performanceDisplay: Double
        let creatinePct: Double
        let proteinPct: Double
        let sleepScore: Double
    }

    private var weekly: [WeeklyPoint] {
        let calendar = Calendar.current
        let weekStarts = Set(
            sessions.map { calendar.dateInterval(of: .weekOfYear, for: $0.date)?.start } +
            checkins.map { calendar.dateInterval(of: .weekOfYear, for: $0.date)?.start }
        ).compactMap { $0 }.sorted()

        let rawTuples: [(Date, Double, Double, Double, Double)] = weekStarts.map { weekStart in
            let weekEnd = calendar.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart
            let weekSessions = sessions.filter { $0.date >= weekStart && $0.date < weekEnd }
            let weekCheckins = checkins.filter { $0.date >= weekStart && $0.date < weekEnd }

            let rawPerformance = weekSessions.isEmpty
                ? 0
                : weekSessions.reduce(0.0) { $0 + Double($1.totalWorkSets) }

            let creatinePct = weekCheckins.isEmpty
                ? 0
                : (Double(weekCheckins.filter(\.tookCreatine).count) / Double(weekCheckins.count)) * 100

            let proteinPct = weekCheckins.isEmpty
                ? 0
                : (Double(weekCheckins.filter(\.proteinTargetMet).count) / Double(weekCheckins.count)) * 100

            let avgSleep = weekCheckins.isEmpty ? 0 : weekCheckins.reduce(0.0) { $0 + $1.sleepHours } / Double(weekCheckins.count)
            let consistencyPenalty = weekCheckins.isEmpty
                ? 0
                : weekCheckins.reduce(0.0) { $0 + abs($1.sleepHours - avgSleep) } / Double(weekCheckins.count)
            let sleepScore = max(0, min(100, ((avgSleep / 9.0) * 100) - (consistencyPenalty * 8)))

            return (weekStart, rawPerformance, creatinePct, proteinPct, sleepScore)
        }

        return rawTuples.enumerated().map { idx, tuple in
            return WeeklyPoint(
                weekStart: tuple.0,
                performanceDisplay: tuple.1,
                creatinePct: tuple.2,
                proteinPct: tuple.3,
                sleepScore: tuple.4
            )
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if weekly.isEmpty {
                    Text("Pas assez de données hebdo")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.top, 24)
                } else {
                    GlassCard(padding: 16, cornerRadius: 22) {
                        VStack(alignment: .leading, spacing: 12) {
                            if let selected = selectedPoint {
                                HStack(spacing: 10) {
                                    globalMetric("Sem.", value: selected.weekStart.shortDate, tint: .white)
                                    globalMetric("Sets", value: String(format: "%.0f", selected.performanceDisplay), tint: .orange)
                                    globalMetric("Créa", value: percentText(selected.creatinePct), tint: SecondaryMetric.creatine.color)
                                    globalMetric("Prot", value: percentText(selected.proteinPct), tint: SecondaryMetric.protein.color)
                                }

                                HStack(spacing: 10) {
                                    globalMetric("Som.", value: sleepValueText(selected.sleepScore), tint: SecondaryMetric.sleep.color)
                                    globalMetric("Moy.", value: "\(Int(averageSets.rounded()))", tint: .orange)
                                    globalMetric("Best", value: bestWeekLabel, tint: .white)
                                }
                            }

                            VStack(spacing: 10) {
                                chartSectionLabel("Sets / semaine", tint: .orange)

                                Chart {
                                    ForEach(weekly) { item in
                                        BarMark(
                                            x: .value("Week", item.weekStart),
                                            y: .value("Sets", item.performanceDisplay),
                                            width: .fixed(18)
                                        )
                                        .foregroundStyle(item.weekStart == selectedPoint?.weekStart ? .orange : .orange.opacity(0.38))
                                        .cornerRadius(5)

                                        if let selected = selectedPoint, item.weekStart == selected.weekStart {
                                            RuleMark(x: .value("Selected week", selected.weekStart))
                                                .foregroundStyle(.white.opacity(0.28))
                                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                                        }
                                    }
                                }
                                .frame(height: 135)
                                .chartYAxis {
                                    AxisMarks(position: .trailing)
                                }
                                .chartOverlay { proxy in
                                    chartSelectionOverlay(proxy: proxy)
                                }

                                recoveryOverview
                            }

                            correlationBoard
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.top, 10)
        }
        .onAppear {
            if selectedWeek == nil {
                selectedWeek = weekly.last?.weekStart
            }
        }
    }

    private func globalMetric(_ title: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func chartSectionLabel(_ title: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Capsule()
                .fill(tint)
                .frame(width: 10, height: 4)
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }

    private func chartSelectionOverlay(proxy: ChartProxy) -> some View {
        GeometryReader { geo in
            Rectangle()
                .fill(.clear)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            if let plotFrame = proxy.plotFrame {
                                let plotOrigin = geo[plotFrame].origin
                                let x = value.location.x - plotOrigin.x
                                if let date: Date = proxy.value(atX: x) {
                                    selectedWeek = nearestWeekStart(to: date)
                                }
                            }
                        }
                )
        }
    }

    private var recoveryOverview: some View {
        VStack(spacing: 10) {
            recoveryRow(for: .creatine)
            recoveryRow(for: .protein)
            recoveryRow(for: .sleep)
        }
        .padding(12)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func recoveryRow(for metric: SecondaryMetric) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                HStack(spacing: 6) {
                    Circle()
                        .fill(metric.color)
                        .frame(width: 8, height: 8)
                    Text(metric.title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let selected = selectedPoint {
                    Text(metricValueText(metricValue(metric, in: selected), metric: metric))
                        .font(.caption.weight(.bold).monospacedDigit())
                        .foregroundStyle(metric.color)
                }
            }

            HStack(spacing: 8) {
                ForEach(weekly) { item in
                    Button {
                        selectedWeek = item.weekStart
                    } label: {
                        VStack(spacing: 4) {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(item.weekStart == selectedPoint?.weekStart ? metric.color.opacity(0.95) : metric.color.opacity(0.24))
                                .frame(height: max(8, CGFloat(metricValue(metric, in: item) / 100) * 34))
                                .frame(maxHeight: 36, alignment: .bottom)

                            Text(item.weekStart.shortDate)
                                .font(.system(size: 8, weight: .medium, design: .rounded))
                                .foregroundStyle(item.weekStart == selectedPoint?.weekStart ? .primary : .tertiary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(height: 52, alignment: .bottom)
        }
    }

    private func insightTile(_ title: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Text(value)
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func metricValue(_ metric: SecondaryMetric, in point: WeeklyPoint) -> Double {
        switch metric {
        case .creatine: return point.creatinePct
        case .protein: return point.proteinPct
        case .sleep: return point.sleepScore
        }
    }

    private func metricValueText(_ value: Double, metric: SecondaryMetric) -> String {
        switch metric {
        case .creatine, .protein:
            return percentText(value)
        case .sleep:
            return sleepValueText(value)
        }
    }

    private var averageSets: Double {
        guard !weekly.isEmpty else { return 0 }
        return weekly.reduce(0.0) { $0 + $1.performanceDisplay } / Double(weekly.count)
    }

    private var bestWeekLabel: String {
        guard let best = weekly.max(by: { $0.performanceDisplay < $1.performanceDisplay }) else { return "--" }
        return best.weekStart.shortDate
    }

    private func correlationScore(for metric: SecondaryMetric) -> Double {
        let xs = weekly.map(\.performanceDisplay)
        let ys = weekly.map { metricValue(metric, in: $0) }
        guard xs.count >= 3 else { return 0 }

        let xMean = xs.reduce(0, +) / Double(xs.count)
        let yMean = ys.reduce(0, +) / Double(ys.count)
        let numerator = zip(xs, ys).reduce(0.0) { acc, pair in
            acc + (pair.0 - xMean) * (pair.1 - yMean)
        }
        let xVariance = xs.reduce(0.0) { $0 + pow($1 - xMean, 2) }
        let yVariance = ys.reduce(0.0) { $0 + pow($1 - yMean, 2) }
        guard xVariance > 0, yVariance > 0 else { return 0 }
        return numerator / sqrt(xVariance * yVariance)
    }

    private func correlationLabel(for metric: SecondaryMetric) -> String {
        let score = correlationScore(for: metric)
        if score >= 0.55 { return "lié +" }
        if score >= 0.25 { return "léger +" }
        if score <= -0.55 { return "inverse" }
        if score <= -0.25 { return "léger -" }
        return "faible"
    }

    private func correlationColor(for metric: SecondaryMetric) -> Color {
        let score = correlationScore(for: metric)
        if score >= 0.25 { return .green }
        if score <= -0.25 { return .orange }
        return .secondary
    }

    private var selectedPoint: WeeklyPoint? {
        guard let selectedWeek else { return nil }
        return weekly.min { abs($0.weekStart.timeIntervalSince(selectedWeek)) < abs($1.weekStart.timeIntervalSince(selectedWeek)) }
    }

    private func nearestWeekStart(to date: Date) -> Date? {
        weekly.min { abs($0.weekStart.timeIntervalSince(date)) < abs($1.weekStart.timeIntervalSince(date)) }?.weekStart
    }

    private var correlationBoard: some View {
        VStack(spacing: 8) {
            Text("Lecture récupération ↔ volume")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 8) {
                correlationTile(metric: .creatine)
                correlationTile(metric: .protein)
                correlationTile(metric: .sleep)
            }
        }
    }

    private func correlationTile(metric: SecondaryMetric) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Circle()
                    .fill(metric.color)
                    .frame(width: 8, height: 8)
                Text(metric.title)
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }

            Text(correlationLabel(for: metric))
                .font(.caption.weight(.bold))
                .foregroundStyle(correlationColor(for: metric))

            Text(correlationHint(for: metric))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func percentText(_ value: Double) -> String {
        "\(String(format: "%.0f", value))%"
    }

    private func sleepValueText(_ value: Double) -> String {
        "\(String(format: "%.0f", value))"
    }

    private func correlationHint(for metric: SecondaryMetric) -> String {
        switch metric {
        case .creatine:
            return "récup suppl."
        case .protein:
            return "apport hebdo"
        case .sleep:
            return "récup sommeil"
        }
    }
}
