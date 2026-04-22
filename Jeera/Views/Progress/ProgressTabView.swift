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
                    ProgressHero(selectedLayer: selectedLayer)
                        .padding(.horizontal)
                        .padding(.top, 10)

                    ProgressLayerSwitcher(selectedLayer: $selectedLayer, namespace: layerNamespace)
                    .padding(.horizontal)
                    .padding(.top, 12)

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

private struct ProgressHero: View {
    let selectedLayer: Int

    private var title: String {
        switch selectedLayer {
        case 0: return "Stress musculaire"
        case 1: return "Lecture par exercice"
        default: return "Corrélations hebdo"
        }
    }

    private var subtitle: String {
        switch selectedLayer {
        case 0: return "Voir où tu manques vraiment de volume, puis ouvrir les détails utiles."
        case 1: return "Voir vite le dernier niveau, la zone benchmark et la tendance de chaque exo."
        default: return "Comparer perf, créatine, protéine et sommeil sans courbes artificielles."
        }
    }

    private var accent: Color {
        switch selectedLayer {
        case 0: return .red
        case 1: return .blue
        default: return .orange
        }
    }

    private var symbol: String {
        switch selectedLayer {
        case 0: return "figure.strengthtraining.traditional"
        case 1: return "dumbbell.fill"
        default: return "waveform.path.ecg"
        }
    }

    var body: some View {
        GlassCard(padding: 18, cornerRadius: 26) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(title)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.8)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()

                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(accent.opacity(0.14))
                        .frame(width: 68, height: 68)
                    Image(systemName: symbol)
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(accent)
                }
            }
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
                    .padding(.vertical, 11)
                    .background {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(isSelected ? Color.white.opacity(0.92) : Color.white.opacity(0.05))
                            .matchedGeometryEffect(id: isSelected ? "progress-layer-pill" : item.1, in: namespace)
                    }
                }
                .buttonStyle(LiftButtonStyle(scale: 0.985))
            }
        }
        .padding(6)
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

    @State private var showPerformance = true
    @State private var showCreatine = true
    @State private var showProtein = true
    @State private var showSleep = true
    @State private var selectedWeek: Date?

    private struct WeeklyPoint: Identifiable {
        let id = UUID()
        let weekStart: Date
        let performance: Double
        let creatinePct: Double
        let proteinPct: Double
        let sleepScore: Double
        let isPositiveCorrelationWindow: Bool
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
                : weekSessions.reduce(0.0) { $0 + Double($1.totalWorkSets) } / Double(weekSessions.count)

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

        let rawValues = rawTuples.map(\.1)
        let minRaw = rawValues.min() ?? 0
        let maxRaw = rawValues.max() ?? 0
        let range = max(maxRaw - minRaw, 1)

        let points: [WeeklyPoint] = rawTuples.map { tuple in
            let normalizedPerformance = ((tuple.1 - minRaw) / range) * 100
            return WeeklyPoint(
                weekStart: tuple.0,
                performance: normalizedPerformance,
                creatinePct: tuple.2,
                proteinPct: tuple.3,
                sleepScore: tuple.4,
                isPositiveCorrelationWindow: false
            )
        }

        return points.enumerated().map { idx, point in
            let prevPerf = idx > 0 ? points[idx - 1].performance : point.performance
            let perfUp = point.performance >= prevPerf
            let adherenceStrong = point.creatinePct >= 60 && point.proteinPct >= 60 && point.sleepScore >= 60
            return WeeklyPoint(
                weekStart: point.weekStart,
                performance: point.performance,
                creatinePct: point.creatinePct,
                proteinPct: point.proteinPct,
                sleepScore: point.sleepScore,
                isPositiveCorrelationWindow: perfUp && adherenceStrong
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
                        VStack(alignment: .leading, spacing: 14) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Global")
                                    .font(.headline.weight(.bold))
                                Text("Performance vs adhérence hebdo, avec lecture rapide puis scrub détaillé.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Chart {
                                ForEach(weekly.filter(\.isPositiveCorrelationWindow)) { item in
                                    RectangleMark(
                                        xStart: .value("Week Start", item.weekStart),
                                        xEnd: .value("Week End", Calendar.current.date(byAdding: .day, value: 7, to: item.weekStart) ?? item.weekStart),
                                        yStart: .value("Bottom", 0),
                                        yEnd: .value("Top", 100)
                                    )
                                    .foregroundStyle(.green.opacity(0.06))
                                }

                                if showPerformance {
                                    ForEach(weekly) { item in
                                        AreaMark(
                                            x: .value("Week", item.weekStart),
                                            y: .value("Performance", item.performance)
                                        )
                                        .foregroundStyle(
                                            LinearGradient(
                                                colors: [.orange.opacity(0.22), .clear],
                                                startPoint: .top,
                                                endPoint: .bottom
                                            )
                                        )

                                        LineMark(
                                            x: .value("Week", item.weekStart),
                                            y: .value("Performance", item.performance)
                                        )
                                        .foregroundStyle(.orange)
                                        .interpolationMethod(.linear)
                                        .lineStyle(StrokeStyle(lineWidth: 3))

                                        PointMark(
                                            x: .value("Week", item.weekStart),
                                            y: .value("Performance", item.performance)
                                        )
                                        .foregroundStyle(.orange)
                                        .symbolSize(30)
                                    }
                                }

                                if showCreatine {
                                    ForEach(weekly) { item in
                                        LineMark(
                                            x: .value("Week", item.weekStart),
                                            y: .value("Creatine", item.creatinePct)
                                        )
                                        .foregroundStyle(.green)
                                        .interpolationMethod(.linear)
                                    }
                                }

                                if showProtein {
                                    ForEach(weekly) { item in
                                        LineMark(
                                            x: .value("Week", item.weekStart),
                                            y: .value("Protein", item.proteinPct)
                                        )
                                        .foregroundStyle(.blue)
                                        .interpolationMethod(.linear)
                                    }
                                }

                                if showSleep {
                                    ForEach(weekly) { item in
                                        LineMark(
                                            x: .value("Week", item.weekStart),
                                            y: .value("Sleep", item.sleepScore)
                                        )
                                        .foregroundStyle(.mint)
                                        .interpolationMethod(.linear)
                                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                                    }
                                }

                                if let selected = selectedPoint {
                                    RuleMark(x: .value("Selected week", selected.weekStart))
                                        .foregroundStyle(.white.opacity(0.35))
                                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                                        .annotation(position: .top, alignment: .leading) {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(selected.weekStart.shortDate)
                                                    .font(.caption2.weight(.semibold))
                                                if showPerformance {
                                                    Text("Perf idx \(selected.performance, specifier: "%.0f")")
                                                        .font(.caption2)
                                                }
                                                if showCreatine {
                                                    Text("Créatine \(selected.creatinePct, specifier: "%.0f")%")
                                                        .font(.caption2)
                                                }
                                                if showProtein {
                                                    Text("Protéine \(selected.proteinPct, specifier: "%.0f")%")
                                                        .font(.caption2)
                                                }
                                                if showSleep {
                                                    Text("Sommeil \(selected.sleepScore, specifier: "%.0f")")
                                                        .font(.caption2)
                                                }
                                            }
                                            .padding(8)
                                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
                                        }
                                }
                            }
                            .frame(height: 250)
                            .chartOverlay { proxy in
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
                                                .onEnded { _ in }
                                        )
                                }
                            }

                            flowLegend

                            Text("Perf idx = performance hebdo normalisée (0–100)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal)

                    if let selected = selectedPoint {
                        GlassCard(padding: 14, cornerRadius: 18) {
                            HStack(spacing: 10) {
                                globalMetric("Semaine", value: selected.weekStart.shortDate, tint: .white)
                                if showPerformance {
                                    globalMetric("Perf", value: String(format: "%.0f", selected.performance), tint: .orange)
                                }
                                if showCreatine {
                                    globalMetric("Créatine", value: "\(String(format: "%.0f", selected.creatinePct))%", tint: .green)
                                }
                                if showProtein {
                                    globalMetric("Protéine", value: "\(String(format: "%.0f", selected.proteinPct))%", tint: .blue)
                                }
                                if showSleep {
                                    globalMetric("Sommeil", value: String(format: "%.0f", selected.sleepScore), tint: .mint)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                }
            }
            .padding(.top, 10)
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

    private var flowLegend: some View {
        ViewThatFits(in: .vertical) {
            HStack(spacing: 8) {
                legendPill("Perf", color: .orange, isOn: $showPerformance)
                legendPill("Créatine", color: .green, isOn: $showCreatine)
                legendPill("Protéine", color: .blue, isOn: $showProtein)
                legendPill("Sommeil", color: .mint, isOn: $showSleep)
            }

            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    legendPill("Perf", color: .orange, isOn: $showPerformance)
                    legendPill("Créatine", color: .green, isOn: $showCreatine)
                }
                HStack(spacing: 8) {
                    legendPill("Protéine", color: .blue, isOn: $showProtein)
                    legendPill("Sommeil", color: .mint, isOn: $showSleep)
                }
            }
        }
    }

    private func legendPill(_ title: String, color: Color, isOn: Binding<Bool>) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.18)) {
                isOn.wrappedValue.toggle()
            }
        } label: {
            HStack(spacing: 7) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(title)
                    .font(.caption.weight(.semibold))
            }
            .foregroundStyle(isOn.wrappedValue ? .white : .secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 999, style: .continuous)
                    .fill(isOn.wrappedValue ? color.opacity(0.20) : Color.white.opacity(0.05))
            )
            .overlay {
                RoundedRectangle(cornerRadius: 999, style: .continuous)
                    .stroke(isOn.wrappedValue ? color.opacity(0.55) : .white.opacity(0.08), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }

    private var selectedPoint: WeeklyPoint? {
        guard let selectedWeek else { return nil }
        return weekly.min { abs($0.weekStart.timeIntervalSince(selectedWeek)) < abs($1.weekStart.timeIntervalSince(selectedWeek)) }
    }

    private func nearestWeekStart(to date: Date) -> Date? {
        weekly.min { abs($0.weekStart.timeIntervalSince(date)) < abs($1.weekStart.timeIntervalSince(date)) }?.weekStart
    }
}
