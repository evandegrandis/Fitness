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
    @Query private var goals: [MuscleGoal]

    private enum SecondaryMetric: String, CaseIterable, Identifiable {
        case sleep, creatine, protein
        var id: String { rawValue }
        var title: String {
            switch self {
            case .creatine: return "Créatine"
            case .protein:  return "Protéines"
            case .sleep:    return "Sommeil"
            }
        }
        var shortTitle: String {
            switch self {
            case .creatine: return "Créa"
            case .protein:  return "Prot"
            case .sleep:    return "Som."
            }
        }
        var color: Color {
            switch self {
            case .creatine: return .green
            case .protein:  return .blue
            case .sleep:    return .mint
            }
        }
    }

    @State private var selectedWeek: Date?
    @State private var selectedRadarParent: MuscleParent?

    private struct WeeklyPoint: Identifiable {
        let id = UUID()
        let weekStart: Date
        let performanceDisplay: Double
        let creatinePct: Double
        let proteinPct: Double
        let sleepScore: Double
        let avgSleepHours: Double
        let parentSets: [MuscleParent: Double]
    }

    private struct RecoveryWeekSnapshot: Identifiable {
        let id = UUID()
        let weekStart: Date
        let sets: Double
        let creatinePct: Double
        let proteinPct: Double
        let sleepHours: Double
    }

    private struct RadarSummary {
        let topParent: MuscleParent?
        let weakestParent: MuscleParent?
        let touchedCount: Int
    }

    private var weekly: [WeeklyPoint] {
        let calendar = Calendar.current
        let weekStarts = Set(
            sessions.map { calendar.dateInterval(of: .weekOfYear, for: $0.date)?.start } +
            checkins.map { calendar.dateInterval(of: .weekOfYear, for: $0.date)?.start }
        ).compactMap { $0 }.sorted()

        return weekStarts.map { weekStart in
            let weekEnd = calendar.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart
            let wSessions = sessions.filter { $0.date >= weekStart && $0.date < weekEnd }
            let wCheckins = checkins.filter { $0.date >= weekStart && $0.date < weekEnd }

            let sets = wSessions.reduce(0.0) { $0 + Double($1.totalWorkSets) }
            let parentSets = EffectiveSetsEngine.parentTotals(
                sessions: wSessions,
                windowStart: weekStart,
                windowEnd: weekEnd
            )

            let creatinePct = wCheckins.isEmpty ? 0 :
                Double(wCheckins.filter(\.tookCreatine).count) / Double(wCheckins.count) * 100

            let proteinPct = wCheckins.isEmpty ? 0 :
                Double(wCheckins.filter(\.proteinTargetMet).count) / Double(wCheckins.count) * 100

            let avgSleep = wCheckins.isEmpty ? 0.0 :
                wCheckins.reduce(0.0) { $0 + $1.sleepHours } / Double(wCheckins.count)
            let penalty = wCheckins.isEmpty ? 0.0 :
                wCheckins.reduce(0.0) { $0 + abs($1.sleepHours - avgSleep) } / Double(wCheckins.count)
            let sleepScore = max(0, min(100, (avgSleep / 9.0) * 100 - penalty * 8))

            return WeeklyPoint(
                weekStart: weekStart,
                performanceDisplay: sets,
                creatinePct: creatinePct,
                proteinPct: proteinPct,
                sleepScore: sleepScore,
                avgSleepHours: avgSleep,
                parentSets: parentSets
            )
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if weekly.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "waveform.path.ecg")
                            .font(.largeTitle)
                            .foregroundStyle(.tertiary)
                        Text("Pas encore de données")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 60)
                } else {
                    volumeChartCard
                    if let selectedPoint {
                        muscleRadarCard(point: selectedPoint)
                        if let selectedRadarParent {
                            radarContributionCard(point: selectedPoint, parent: selectedRadarParent)
                        }
                    }
                    if weekly.count >= 3 {
                        insightsCard
                        weeklyCorrelationStrip
                    }
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)
        }
        .onAppear {
            if selectedWeek == nil {
                selectedWeek = weekly.last?.weekStart
            }
        }
    }

    // MARK: - Volume Chart Card

    private var volumeChartCard: some View {
        GlassCard(padding: 16, cornerRadius: 22) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("VOLUME · SETS / SEMAINE")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundStyle(.tertiary)
                        if let sel = selectedPoint {
                            Text("Sem. \(sel.weekStart.shortDate)")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                                .transition(.opacity)
                                .id(sel.weekStart)
                        }
                    }
                    Spacer()
                    bigStat("\(Int(averageSets.rounded()))", sub: "moy.", tint: .white.opacity(0.55))
                }

                Chart {
                    ForEach(weekly) { item in
                        BarMark(
                            x: .value("Sem.", item.weekStart),
                            y: .value("Sets", item.performanceDisplay),
                            width: .ratio(0.55)
                        )
                        .foregroundStyle(
                            item.weekStart == selectedPoint?.weekStart
                                ? Color.orange
                                : Color.orange.opacity(0.22)
                        )
                        .cornerRadius(6)
                    }

                    if let sel = selectedPoint {
                        RuleMark(x: .value("Sél.", sel.weekStart))
                            .foregroundStyle(.white.opacity(0.18))
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                            .annotation(position: .top, alignment: .center, spacing: 4) {
                                Text("\(Int(sel.performanceDisplay))")
                                    .font(.system(size: 11, weight: .heavy).monospacedDigit())
                                    .foregroundStyle(.orange)
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 3)
                                    .background(.ultraThinMaterial, in: Capsule())
                            }
                    }
                }
                .frame(height: 112)
                .chartYAxis {
                    AxisMarks(position: .trailing) { _ in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.3))
                            .foregroundStyle(.white.opacity(0.07))
                        AxisValueLabel()
                            .font(.system(size: 9))
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: min(weekly.count, 6))) { value in
                        AxisValueLabel {
                            if let date = value.as(Date.self) {
                                Text(date.shortDate)
                                    .font(.system(size: 9))
                            }
                        }
                    }
                }
                .chartOverlay { proxy in
                    GeometryReader { geo in
                        Rectangle()
                            .fill(.clear)
                            .contentShape(Rectangle())
                            .gesture(
                                DragGesture(minimumDistance: 0)
                                    .onChanged { val in
                                        if let frame = proxy.plotFrame {
                                            let x = val.location.x - geo[frame].origin.x
                                            if let date: Date = proxy.value(atX: x) {
                                                selectedWeek = nearestWeekStart(to: date)
                                            }
                                        }
                                    }
                            )
                    }
                }

                if let sel = selectedPoint {
                    weekSnapshotStrip(point: sel)
                }
            }
        }
    }

    // MARK: - Muscle Radar Card

    private func muscleRadarCard(point: WeeklyPoint) -> some View {
        let orderedParents = goals
            .filter { $0.weeklyGoalSets > 0 }
            .sorted { $0.parent.displayName < $1.parent.displayName }
            .map(\.parent)

        let values: [(parent: MuscleParent, sets: Double, goal: Double, ratio: Double)] = orderedParents.map { parent in
            let goal = goals.first(where: { $0.parent == parent })?.weeklyGoalSets ?? 0
            let sets = point.parentSets[parent] ?? 0
            let ratio = goal > 0 ? min(1.0, sets / goal) : 0
            return (parent, sets, goal, ratio)
        }
        let summary = radarSummary(from: values)

        return GlassCard(padding: 16, cornerRadius: 22) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("RÉPARTITION MUSCULAIRE")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundStyle(.tertiary)
                        Text("Sem. \(point.weekStart.shortDate)")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(values.filter { $0.sets > 0.1 }.count) groupes touchés")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                MuscleRadarChart(values: values) { parent in
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                        selectedRadarParent = parent
                    }
                }
                    .frame(height: 248)
                    .onChange(of: point.weekStart) { _, _ in
                        selectedRadarParent = nil
                    }

                HStack(spacing: 8) {
                    radarSummaryPill(label: "dominant", value: summary.topParent?.shortName ?? "—", tint: .accentColor)
                    radarSummaryPill(label: "faible", value: summary.weakestParent?.shortName ?? "—", tint: .orange)
                    radarSummaryPill(label: "touchés", value: "\(summary.touchedCount)", tint: .secondary)
                }
            }
        }
    }

    private func radarContributionCard(point: WeeklyPoint, parent: MuscleParent) -> some View {
        let items = exerciseContributions(for: parent, weekStart: point.weekStart)
        let goal = goals.first(where: { $0.parent == parent })?.weeklyGoalSets ?? 0
        let sets = point.parentSets[parent] ?? 0
        let completion = goal > 0 ? min(1.0, sets / goal) : 0
        let remaining = max(0, goal - sets)

        return GlassCard(padding: 16, cornerRadius: 18) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(parent.displayName)
                            .font(.subheadline.weight(.bold))
                        Text("Détail sem. \(point.weekStart.shortDate)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        selectedRadarParent = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 8) {
                    radarStatPill(label: "faits", value: "\(Int(sets.rounded()))", tint: .accentColor)
                    radarStatPill(label: "objectif", value: "\(Int(goal.rounded()))", tint: .secondary)
                    radarStatPill(label: "couv.", value: "\(Int((completion * 100).rounded()))%", tint: completion >= 1 ? .green : .orange)
                    radarStatPill(label: "reste", value: "\(Int(remaining.rounded(.up)))", tint: remaining <= 0 ? .green : .primary)
                }

                if items.isEmpty {
                    Text("Aucune contribution")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(Array(items.prefix(6).enumerated()), id: \.element.name) { _, item in
                        HStack(spacing: 8) {
                            Text(item.name)
                                .font(.caption.weight(.medium))
                                .lineLimit(1)
                            Spacer()
                            Text(String(format: "%.1f", item.sets))
                                .font(.caption.weight(.bold).monospacedDigit())
                                    .foregroundStyle(Color.accentColor)
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
        }
    }

    private func recoveryMetricCard(_ metric: SecondaryMetric, point: WeeklyPoint) -> some View {
        let value = metricValue(metric, in: point)
        let ratio = min(1.0, max(0, value / 100.0))
        let displayText: String = {
            switch metric {
            case .sleep:
                return point.avgSleepHours > 0 ? String(format: "%.1fh", point.avgSleepHours) : "—"
            case .creatine, .protein:
                return "\(Int(value.rounded()))%"
            }
        }()
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle()
                    .fill(metric.color)
                    .frame(width: 8, height: 8)
                Text(metric.shortTitle)
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(metric.color.opacity(0.10))
                    Capsule()
                        .fill(LinearGradient(
                            colors: [metric.color.opacity(0.65), metric.color],
                            startPoint: .leading,
                            endPoint: .trailing
                        ))
                        .frame(width: max(0, geo.size.width * ratio))
                        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: ratio)
                }
            }
            .frame(height: 7)

            HStack {
                Text(displayText)
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(metric.color)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func weekSnapshotStrip(point: WeeklyPoint) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                snapshotPill(label: "Sets", value: "\(Int(point.performanceDisplay))", tint: .orange)
                snapshotPill(label: "Créa", value: "\(Int(point.creatinePct.rounded()))%", tint: .green)
                snapshotPill(label: "Prot", value: "\(Int(point.proteinPct.rounded()))%", tint: .blue)
                snapshotPill(label: "Som.", value: point.avgSleepHours > 0 ? String(format: "%.1fh", point.avgSleepHours) : "—", tint: .mint)
            }

            HStack(spacing: 8) {
                ForEach(SecondaryMetric.allCases) { metric in
                    recoveryMetricCard(metric, point: point)
                }
            }
        }
    }

    // MARK: - Insights / Correlation Card

    private var insightsCard: some View {
        GlassCard(padding: 16, cornerRadius: 22) {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("CORRÉLATIONS")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(.tertiary)
                    Text("Récupération ↔ volume · \(weekly.count) semaines")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 8) {
                    ForEach(SecondaryMetric.allCases) { metric in
                        correlationTile(metric: metric)
                    }
                }
            }
        }
    }

    private var weeklyCorrelationStrip: some View {
        let rows = weekly.map {
            RecoveryWeekSnapshot(
                weekStart: $0.weekStart,
                sets: $0.performanceDisplay,
                creatinePct: $0.creatinePct,
                proteinPct: $0.proteinPct,
                sleepHours: $0.avgSleepHours
            )
        }

        return GlassCard(padding: 16, cornerRadius: 22) {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("SEMAINE PAR SEMAINE")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(.tertiary)
                    Text("Volume et récup côte à côte")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                ForEach(rows) { row in
                    HStack(spacing: 10) {
                        Text(row.weekStart.shortDate)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(width: 52, alignment: .leading)

                        miniMetric(label: "S", value: "\(Int(row.sets.rounded()))", tint: .orange)
                        miniMetric(label: "C", value: "\(Int(row.creatinePct.rounded()))%", tint: .green)
                        miniMetric(label: "P", value: "\(Int(row.proteinPct.rounded()))%", tint: .blue)
                        miniMetric(label: "Som", value: row.sleepHours > 0 ? String(format: "%.1fh", row.sleepHours) : "—", tint: .mint)
                        weekRelationPill(for: row)

                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private func correlationTile(metric: SecondaryMetric) -> some View {
        let score = correlationScore(for: metric)
        let tint = correlationColor(for: metric)
        let barRatio = min(1.0, abs(score))
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                Circle()
                    .fill(metric.color)
                    .frame(width: 7, height: 7)
                Text(metric.shortTitle)
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(tint.opacity(0.10))
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(tint)
                        .frame(width: max(0, geo.size.width * barRatio))
                }
            }
            .frame(height: 4)

            Text(correlationLabel(for: metric))
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)

            Text(correlationHint(for: metric))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: - Stat display helper

    private func bigStat(_ value: String, sub: String, tint: Color) -> some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(tint)
            Text(sub)
                .font(.system(size: 9, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
        }
    }

    private func miniMetric(label: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .bold, design: .rounded))
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.system(size: 10, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(tint)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func radarStatPill(label: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .bold, design: .rounded))
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.system(size: 10, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func radarSummaryPill(label: String, value: String, tint: Color) -> some View {
        HStack(spacing: 5) {
            Text(label)
                .font(.system(size: 8, weight: .bold, design: .rounded))
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(tint)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func weekRelationPill(for row: RecoveryWeekSnapshot) -> some View {
        let relation = weekRelation(for: row)
        return Text(relation.label)
            .font(.system(size: 9, weight: .bold, design: .rounded))
            .foregroundStyle(relation.tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(relation.tint.opacity(0.12), in: Capsule())
    }

    private func snapshotPill(label: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.system(size: 13, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: - Data helpers

    private func metricValue(_ metric: SecondaryMetric, in point: WeeklyPoint) -> Double {
        switch metric {
        case .creatine: return point.creatinePct
        case .protein:  return point.proteinPct
        case .sleep:    return point.sleepScore
        }
    }

    private var averageSets: Double {
        guard !weekly.isEmpty else { return 0 }
        return weekly.reduce(0.0) { $0 + $1.performanceDisplay } / Double(weekly.count)
    }

    private var selectedPoint: WeeklyPoint? {
        guard let selectedWeek else { return nil }
        return weekly.min {
            abs($0.weekStart.timeIntervalSince(selectedWeek)) < abs($1.weekStart.timeIntervalSince(selectedWeek))
        }
    }

    private func nearestWeekStart(to date: Date) -> Date? {
        weekly.min {
            abs($0.weekStart.timeIntervalSince(date)) < abs($1.weekStart.timeIntervalSince(date))
        }?.weekStart
    }

    private func correlationScore(for metric: SecondaryMetric) -> Double {
        let xs = weekly.map(\.performanceDisplay)
        let ys = weekly.map { metricValue(metric, in: $0) }
        guard xs.count >= 3 else { return 0 }
        let xMean = xs.reduce(0, +) / Double(xs.count)
        let yMean = ys.reduce(0, +) / Double(ys.count)
        let num = zip(xs, ys).reduce(0.0) { $0 + ($1.0 - xMean) * ($1.1 - yMean) }
        let xVar = xs.reduce(0.0) { $0 + pow($1 - xMean, 2) }
        let yVar = ys.reduce(0.0) { $0 + pow($1 - yMean, 2) }
        guard xVar > 0, yVar > 0 else { return 0 }
        return num / sqrt(xVar * yVar)
    }

    private func correlationLabel(for metric: SecondaryMetric) -> String {
        let s = correlationScore(for: metric)
        if s >= 0.55 { return "lié +" }
        if s >= 0.25 { return "léger +" }
        if s <= -0.55 { return "inverse" }
        if s <= -0.25 { return "léger -" }
        return "faible"
    }

    private func correlationColor(for metric: SecondaryMetric) -> Color {
        let s = correlationScore(for: metric)
        if s >= 0.25 { return .green }
        if s <= -0.25 { return .orange }
        return .secondary
    }

    private func correlationHint(for metric: SecondaryMetric) -> String {
        switch metric {
        case .creatine: return "récup. suppl."
        case .protein:  return "apport hebdo"
        case .sleep:    return "récup. sommeil"
        }
    }

    private func exerciseContributions(for parent: MuscleParent, weekStart: Date) -> [(name: String, sets: Double)] {
        let weekEnd = Calendar.current.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart
        var contributions: [String: Double] = [:]

        for session in sessions where session.date >= weekStart && session.date < weekEnd {
            for logged in session.loggedExercises {
                guard let exercise = logged.exercise else { continue }
                let contribution = EffectiveSetsEngine.parentSets(for: logged)[parent] ?? 0
                guard contribution > 0 else { continue }
                contributions[exercise.name, default: 0] += contribution
            }
        }

        return contributions
            .map { ($0.key, $0.value) }
            .sorted {
                if abs($0.sets - $1.sets) > 0.01 {
                    return $0.sets > $1.sets
                }
                return $0.name < $1.name
            }
    }

    private func weekRelation(for row: RecoveryWeekSnapshot) -> (label: String, tint: Color) {
        let averageRecovery = (row.creatinePct + row.proteinPct + min(100, (row.sleepHours / 9.0) * 100)) / 3
        let volumeBaseline = max(averageSets, 1)
        let volumeRatio = min(1.4, row.sets / volumeBaseline)
        let recoveryRatio = averageRecovery / 100
        let gap = volumeRatio - recoveryRatio

        if gap > 0.25 { return ("vol > récup", .orange) }
        if gap < -0.20 { return ("récup > vol", .mint) }
        return ("aligné", .green)
    }

    private func radarSummary(from values: [(parent: MuscleParent, sets: Double, goal: Double, ratio: Double)]) -> RadarSummary {
        let touched = values.filter { $0.sets > 0.1 }
        let top = touched.max { $0.sets < $1.sets }
        let weakest = values
            .filter { $0.goal > 0 }
            .min {
                if abs($0.ratio - $1.ratio) > 0.001 {
                    return $0.ratio < $1.ratio
                }
                return $0.parent.displayName < $1.parent.displayName
            }

        return RadarSummary(
            topParent: top?.parent,
            weakestParent: weakest?.parent,
            touchedCount: touched.count
        )
    }
}

private struct MuscleRadarChart: View {
    let values: [(parent: MuscleParent, sets: Double, goal: Double, ratio: Double)]
    var onSelectParent: ((MuscleParent) -> Void)?

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let radius = size * 0.31
            let ringLevels = [0.25, 0.5, 0.75, 1.0]

            ZStack {
                ForEach(ringLevels, id: \.self) { level in
                    RadarPolygonShape(points: radarPoints(for: values.map { _ in level }, center: center, radius: radius))
                        .stroke(Color.white.opacity(level == 1.0 ? 0.12 : 0.06), style: StrokeStyle(lineWidth: level == 1.0 ? 1 : 0.6))
                }

                ForEach(Array(values.enumerated()), id: \.offset) { index, item in
                    Path { path in
                        path.move(to: center)
                        path.addLine(to: point(at: index, total: values.count, center: center, radius: radius))
                    }
                    .stroke(Color.white.opacity(0.06), lineWidth: 0.6)

                    let labelPoint = point(at: index, total: values.count, center: center, radius: radius + 28)
                    VStack(spacing: 1) {
                        Text(item.parent.shortName)
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Text("\(Int(item.sets.rounded()))")
                            .font(.system(size: 10, weight: .heavy, design: .rounded).monospacedDigit())
                            .foregroundStyle(item.ratio >= 1 ? .green : item.ratio >= 0.5 ? .orange : .primary)
                    }
                    .position(labelPoint)

                    Circle()
                        .fill(.clear)
                        .frame(width: 48, height: 48)
                        .contentShape(Circle())
                        .position(labelPoint)
                        .onTapGesture {
                            onSelectParent?(item.parent)
                        }
                }

                RadarPolygonShape(points: radarPoints(for: values.map(\.ratio), center: center, radius: radius))
                    .fill(
                        LinearGradient(
                            colors: [Color.accentColor.opacity(0.26), Color.mint.opacity(0.10)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                RadarPolygonShape(points: radarPoints(for: values.map(\.ratio), center: center, radius: radius))
                    .stroke(
                        LinearGradient(
                            colors: [Color.accentColor, Color.mint],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        style: StrokeStyle(lineWidth: 2, lineJoin: .round)
                    )

                ForEach(Array(values.enumerated()), id: \.offset) { index, item in
                    let valuePoint = point(at: index, total: values.count, center: center, radius: radius * item.ratio)
                    Circle()
                        .fill(item.ratio >= 1 ? Color.green : Color.accentColor)
                        .frame(width: 7, height: 7)
                        .overlay {
                            Circle().stroke(Color.white.opacity(0.7), lineWidth: 1)
                        }
                        .position(valuePoint)
                        .contentShape(Circle())
                        .onTapGesture {
                            onSelectParent?(item.parent)
                        }
                }
            }
        }
    }

    private func radarPoints(for ratios: [Double], center: CGPoint, radius: CGFloat) -> [CGPoint] {
        ratios.enumerated().map { index, ratio in
            point(at: index, total: ratios.count, center: center, radius: radius * ratio)
        }
    }

    private func point(at index: Int, total: Int, center: CGPoint, radius: CGFloat) -> CGPoint {
        let angle = (Double(index) / Double(max(total, 1))) * .pi * 2 - .pi / 2
        return CGPoint(
            x: center.x + cos(angle) * radius,
            y: center.y + sin(angle) * radius
        )
    }
}

private struct RadarPolygonShape: Shape {
    let points: [CGPoint]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard let first = points.first else { return path }
        path.move(to: first)
        for point in points.dropFirst() {
            path.addLine(to: point)
        }
        path.closeSubpath()
        return path
    }
}
