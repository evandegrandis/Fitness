import SwiftUI
import SwiftData
import Charts

struct MuscleProgressView: View {
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var sessions: [WorkoutSession]
    @Query private var goals: [MuscleGoal]
    @State private var selectedParent: MuscleParent?
    @State private var progress: [ParentMuscleProgress] = []
    @State private var globalCoverage: Double = 0

    /// Hash of goal values + session count so `.task(id:)` re-fires when
    /// goals are edited in Settings or new sessions finish.
    private var dataFingerprint: Int {
        var hasher = Hasher()
        for g in goals {
            hasher.combine(g.parent)
            hasher.combine(g.weeklyGoalSets)
        }
        hasher.combine(sessions.count)
        return hasher.finalize()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                ForEach(progress) { item in
                    VStack(spacing: 5) {
                        ParentMuscleCard(
                            progress: item,
                            isSelected: selectedParent == item.parent
                        )
                        .onTapGesture {
                            withAnimation(.spring(response: 0.3)) {
                                if selectedParent == item.parent {
                                    selectedParent = nil
                                } else {
                                    selectedParent = item.parent
                                    HapticManager.selection()
                                }
                            }
                        }

                        if selectedParent == item.parent {
                            ParentDetailCard(
                                parent: item.parent,
                                sessions: sessions,
                                goals: goals
                            )
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .scale(scale: 0.95, anchor: .top)),
                                removal: .opacity
                            ))
                        }
                    }
                    .padding(.horizontal)
                }

                if progress.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "chart.bar.doc.horizontal")
                            .font(.largeTitle)
                            .foregroundStyle(.tertiary)
                        Text("Pas encore de données")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("Fais des séances pour voir ta progression.")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.top, 60)
                }

                Spacer(minLength: 80)
            }
            .padding(.top, 8)
        }
        .task(id: dataFingerprint) {
            progress = EffectiveSetsEngine.rolling7DayProgress(sessions: sessions, goals: goals)
                .filter { $0.goalSets > 0 || $0.effectiveSets > 0 }
                .sorted { $0.goalSets > $1.goalSets }
            globalCoverage = EffectiveSetsEngine.rolling7DayGlobalCoverage(sessions: sessions, goals: goals)
        }
    }
}

// MARK: - Parent Muscle Card

struct ParentMuscleCard: View {
    let progress: ParentMuscleProgress
    var isSelected: Bool = false

    private var statusColor: Color {
        switch progress.status {
        case .covered:       return .green
        case .onTrack:       return .blue
        case .toStrengthen:  return .orange
        case .priority:      return .red
        }
    }

    var body: some View {
        GlassCard(padding: 14, cornerRadius: 18) {
            VStack(spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            Text(progress.parent.displayName)
                                .font(.callout.weight(.semibold))
                            Image(systemName: isSelected ? "chevron.up" : "chevron.down")
                                .font(.system(size: 8))
                                .foregroundStyle(.tertiary)
                        }

                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(Int(progress.effectiveSets.rounded()))")
                                .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                                .foregroundStyle(statusColor)
                            Text("/ \(Int(progress.goalSets.rounded()))")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        
                        Text(progress.remaining <= 0 ? "Couvert" : "\(Int(ceil(progress.remaining))) restants")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text(progress.status.label)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(statusColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(statusColor.opacity(0.12), in: Capsule())
                }

                ProgressBar(
                    progress: Double(progress.percentDisplay),
                    height: 7,
                    accentColor: statusColor
                )
            }
        }
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(statusColor.opacity(0.4), lineWidth: 1)
            }
        }
    }
}

// MARK: - Parent History Chart (calendar-week bars for history browsing)

struct ParentDetailCard: View {
    let parent: MuscleParent
    let sessions: [WorkoutSession]
    let goals: [MuscleGoal]
    @State private var selectedWeekStart: Date?

    private var goalValue: Double {
        goals.first(where: { $0.parent == parent })?.weeklyGoalSets ?? 0
    }

    private var weeklyData: [(weekStart: Date, sets: Double)] {
        let calendar = Calendar.current
        let today = Date()
        var data: [(Date, Double)] = []
        for weekOffset in (0..<8).reversed() {
            guard let weekStart = calendar.date(byAdding: .weekOfYear, value: -weekOffset, to: today.startOfWeek) else { continue }
            let weekEnd = calendar.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart
            let totals = EffectiveSetsEngine.parentTotals(
                sessions: sessions,
                windowStart: weekStart,
                windowEnd: weekEnd
            )
            data.append((weekStart, totals[parent] ?? 0))
        }
        return data
    }

    private var breakdown: [(leaf: MuscleGroup, sets: Double)] {
        EffectiveSetsEngine.rolling7DayLeafBreakdown(sessions: sessions, parent: parent)
    }

    private var maxSets: Double {
        breakdown.map(\.sets).max() ?? 1
    }

    private var selectedWeekContributions: [(name: String, sets: Double)] {
        guard let selectedWeekStart else { return [] }
        let calendar = Calendar.current
        let weekEnd = calendar.date(byAdding: .day, value: 7, to: selectedWeekStart) ?? selectedWeekStart
        var contributions: [String: Double] = [:]

        for session in sessions where session.date >= selectedWeekStart && session.date < weekEnd {
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

    var body: some View {
        GlassCard(padding: 14, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 8) {
                if !breakdown.isEmpty {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Sous-groupes")
                            .font(.caption.weight(.semibold))

                        ForEach(breakdown, id: \.leaf) { item in
                            HStack(spacing: 8) {
                                Text(item.leaf.displayName)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .frame(width: 104, alignment: .leading)
                                    .lineLimit(1)

                                GeometryReader { geo in
                                    let barWidth = maxSets > 0
                                        ? CGFloat(item.sets / maxSets) * geo.size.width
                                        : 0
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(Color.accentColor.opacity(0.6))
                                        .frame(width: max(barWidth, 0), height: 5)
                                        .frame(maxHeight: .infinity, alignment: .center)
                                }
                                .frame(height: 10)

                                Text(item.sets > 0 ? String(format: "%.1f", item.sets) : "—")
                                    .font(.caption2.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(item.sets > 0 ? .primary : .tertiary)
                                    .frame(width: 28, alignment: .trailing)
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Historique")
                        .font(.caption.weight(.semibold))

                    if weeklyData.allSatisfy({ $0.sets == 0 }) {
                        Text("Pas encore d'historique")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(height: 90)
                            .frame(maxWidth: .infinity)
                    } else {
                        Chart {
                            ForEach(weeklyData, id: \.weekStart) { item in
                                BarMark(
                                    x: .value("Week", item.weekStart, unit: .weekOfYear),
                                    y: .value("Sets", item.sets)
                                )
                                .opacity(isSelectedWeek(item.weekStart) ? 1 : 0.72)
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: isSelectedWeek(item.weekStart)
                                            ? [Color.accentColor.opacity(1.0), Color.accentColor.opacity(0.65)]
                                            : [Color.accentColor.opacity(0.95), Color.accentColor.opacity(0.45)],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                )
                                .cornerRadius(5)
                            }

                            if goalValue > 0 {
                                RuleMark(y: .value("Goal", goalValue))
                                    .foregroundStyle(.green.opacity(0.5))
                                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                            }
                        }
                        .frame(height: 110)
                        .chartXAxis {
                            AxisMarks(values: .stride(by: .weekOfYear)) { value in
                                AxisValueLabel {
                                    if let date = value.as(Date.self) {
                                        Text(date.weekLabel)
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
                        .chartOverlay { proxy in
                            GeometryReader { geo in
                                Rectangle()
                                    .fill(.clear)
                                    .contentShape(Rectangle())
                                    .gesture(
                                        DragGesture(minimumDistance: 0)
                                            .onEnded { value in
                                                guard let plotFrame = proxy.plotFrame else { return }
                                                let plotOrigin = geo[plotFrame].origin
                                                let x = value.location.x - plotOrigin.x
                                                if let date: Date = proxy.value(atX: x) {
                                                    let week = nearestWeekStart(to: date)
                                                    if selectedWeekStart == week {
                                                        selectedWeekStart = nil
                                                    } else {
                                                        selectedWeekStart = week
                                                    }
                                                    HapticManager.selection()
                                                }
                                            }
                                    )
                            }
                        }
                    }
                }

                if let selectedWeekStart, !selectedWeekContributions.isEmpty {
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            Text("Détail \(selectedWeekStart.weekLabel)")
                                .font(.caption.weight(.semibold))
                            Spacer()
                            Text("\(Int(selectedWeekContributions.reduce(0) { $0 + $1.sets }.rounded())) séries")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }

                        Text("Exercices qui ont compté pour \(parent.displayName.lowercased()) cette semaine")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)

                        ForEach(selectedWeekContributions.prefix(5), id: \.name) { item in
                            HStack(spacing: 8) {
                                Text(item.name)
                                    .font(.caption2)
                                    .lineLimit(1)
                                Spacer()
                                Text(String(format: "%.1f", item.sets))
                                    .font(.caption2.weight(.bold).monospacedDigit())
                                    .foregroundStyle(.accent)
                            }
                            .padding(.vertical, 3)
                        }
                    }
                }
            }
        }
    }

    private func nearestWeekStart(to date: Date) -> Date? {
        weeklyData.min {
            abs($0.weekStart.timeIntervalSince(date)) < abs($1.weekStart.timeIntervalSince(date))
        }?.weekStart
    }

    private func isSelectedWeek(_ weekStart: Date) -> Bool {
        guard let selectedWeekStart else { return false }
        return Calendar.current.isDate(weekStart, equalTo: selectedWeekStart, toGranularity: .weekOfYear)
    }
}
