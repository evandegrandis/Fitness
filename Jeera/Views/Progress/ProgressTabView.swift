import SwiftUI
import SwiftData
import Charts

struct ProgressTabView: View {
    @State private var selectedLayer = 0

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundGradient()

                VStack(spacing: 0) {
                    // Segmented Picker
                    Picker("Layer", selection: $selectedLayer) {
                        Text("Muscles").tag(0)
                        Text("Exercices").tag(1)
                        Text("Global").tag(2)
                    }
                    .pickerStyle(.segmented)
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
                }
            }
            .navigationTitle("Progrès")
            .navigationBarTitleDisplayMode(.inline)
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
                                LineMark(
                                    x: .value("Week", item.weekStart),
                                    y: .value("Performance", item.performance)
                                )
                                .foregroundStyle(.orange)
                                .interpolationMethod(.catmullRom)
                            }
                        }

                        if showCreatine {
                            ForEach(weekly) { item in
                                LineMark(
                                    x: .value("Week", item.weekStart),
                                    y: .value("Creatine", item.creatinePct)
                                )
                                .foregroundStyle(.green)
                            }
                        }

                        if showProtein {
                            ForEach(weekly) { item in
                                LineMark(
                                    x: .value("Week", item.weekStart),
                                    y: .value("Protein", item.proteinPct)
                                )
                                .foregroundStyle(.blue)
                            }
                        }

                        if showSleep {
                            ForEach(weekly) { item in
                                LineMark(
                                    x: .value("Week", item.weekStart),
                                    y: .value("Sleep", item.sleepScore)
                                )
                                .foregroundStyle(.purple)
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
                                    .padding(6)
                                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
                                }
                        }
                    }
                    .frame(height: 220)
                    .padding(.horizontal)
                    .chartOverlay { proxy in
                        GeometryReader { geo in
                            Rectangle()
                                .fill(.clear)
                                .contentShape(Rectangle())
                                .gesture(
                                    DragGesture(minimumDistance: 0)
                                        .onChanged { value in
                                            let plotOrigin = geo[proxy.plotAreaFrame].origin
                                            let x = value.location.x - plotOrigin.x
                                            if let date: Date = proxy.value(atX: x) {
                                                selectedWeek = nearestWeekStart(to: date)
                                            }
                                        }
                                        .onEnded { _ in }
                                )
                        }
                    }

                    VStack(spacing: 8) {
                        Toggle("Performance", isOn: $showPerformance).tint(.orange)
                        Toggle("Créatine %", isOn: $showCreatine).tint(.green)
                        Toggle("Protéine %", isOn: $showProtein).tint(.blue)
                        Toggle("Sommeil score", isOn: $showSleep).tint(.purple)
                    }
                    .font(.caption)
                    .padding(.horizontal)
                    Text("Perf idx = performance hebdo normalisée (0–100)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)
                }
            }
            .padding(.top, 10)
        }
    }

    private var selectedPoint: WeeklyPoint? {
        guard let selectedWeek else { return nil }
        return weekly.min { abs($0.weekStart.timeIntervalSince(selectedWeek)) < abs($1.weekStart.timeIntervalSince(selectedWeek)) }
    }

    private func nearestWeekStart(to date: Date) -> Date? {
        weekly.min { abs($0.weekStart.timeIntervalSince(date)) < abs($1.weekStart.timeIntervalSince(date)) }?.weekStart
    }
}
