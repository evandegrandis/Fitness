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

    private var progress: [ParentMuscleProgress] {
        EffectiveSetsEngine.rolling7DayProgress(sessions: sessions, goals: goals)
            .filter { $0.goalSets > 0 || $0.effectiveSets > 0 }
            .sorted { $0.goalSets > $1.goalSets }
    }

    private var globalCoverage: Double {
        EffectiveSetsEngine.rolling7DayGlobalCoverage(sessions: sessions, goals: goals)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                // Rolling 7-day header
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("7 derniers jours")
                            .font(.subheadline.weight(.semibold))
                        Text("Couverture globale \(Int((globalCoverage * 100).rounded()))%")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(.horizontal)

                ForEach(progress) { item in
                    VStack(spacing: 6) {
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
                            ParentHistoryChart(
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
            .padding(.top, 10)
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
        GlassCard(padding: 14, cornerRadius: 16) {
            VStack(spacing: 8) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            Text(progress.parent.displayName)
                                .font(.subheadline.weight(.semibold))
                            Image(systemName: isSelected ? "chevron.up" : "chevron.down")
                                .font(.system(size: 8))
                                .foregroundStyle(.tertiary)
                        }

                        HStack(spacing: 3) {
                            Text("\(Int(progress.effectiveSets.rounded()))")
                                .font(.title3.weight(.bold).monospacedDigit())
                                .foregroundStyle(statusColor)
                            Text("/ \(Int(progress.goalSets.rounded()))")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 2) {
                        Text(progress.status.label)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(statusColor)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(statusColor.opacity(0.12), in: Capsule())

                        if progress.remaining > 0 {
                            Text("\(Int(ceil(progress.remaining))) restants")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Progress bar
                ProgressBar(
                    progress: Double(progress.percentDisplay),
                    height: 5,
                    accentColor: statusColor
                )
            }
        }
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(statusColor.opacity(0.4), lineWidth: 1)
            }
        }
    }
}

// MARK: - Parent History Chart (calendar-week bars for history browsing)

struct ParentHistoryChart: View {
    let parent: MuscleParent
    let sessions: [WorkoutSession]
    let goals: [MuscleGoal]

    private var goalValue: Double {
        goals.first(where: { $0.parent == parent })?.weeklyGoalSets ?? 0
    }

    private var weeklyData: [(weekStart: Date, sets: Double)] {
        // Last 8 weeks of calendar data.
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

    var body: some View {
        GlassCard(padding: 14, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Historique (8 semaines)")
                    .font(.caption.weight(.semibold))

                if weeklyData.allSatisfy({ $0.sets == 0 }) {
                    Text("Pas encore d'historique")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(height: 100)
                        .frame(maxWidth: .infinity)
                } else {
                    Chart {
                        ForEach(weeklyData, id: \.weekStart) { item in
                            BarMark(
                                x: .value("Week", item.weekStart, unit: .weekOfYear),
                                y: .value("Sets", item.sets)
                            )
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [Color.accentColor, Color.accentColor.opacity(0.4)],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                            .cornerRadius(3)
                        }

                        if goalValue > 0 {
                            RuleMark(y: .value("Goal", goalValue))
                                .foregroundStyle(.green.opacity(0.5))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        }
                    }
                    .frame(height: 130)
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
                }
            }
        }
    }
}
