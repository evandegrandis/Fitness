import SwiftUI
import SwiftData
import Charts

struct MuscleProgressView: View {
    @Query private var sessions: [WorkoutSession]
    @Query private var goals: [MuscleGoal]
    @State private var selectedMuscle: MuscleGroup?
    @State private var showAbsolute = true

    private var progress: [MuscleGroupProgress] {
        EffectiveSetsEngine.currentWeekProgress(sessions: sessions, goals: goals)
            .filter { $0.goalSets > 0 || $0.effectiveSets > 0 }
            .sorted { $0.goalSets > $1.goalSets }
    }

    // Day-of-week pacing (Mon=1, Sun=7)
    private var weekPace: Double {
        let dayOfWeek = Calendar.current.component(.weekday, from: Date())
        let dayIndex = dayOfWeek == 1 ? 7 : dayOfWeek - 1
        return Double(dayIndex) / 7.0
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                WeekHeaderView(pace: weekPace)
                    .padding(.horizontal)

                ForEach(progress) { item in
                    VStack(spacing: 6) {
                        MuscleGroupCard(
                            progress: item,
                            weekPace: weekPace,
                            isSelected: selectedMuscle == item.muscleGroup
                        )
                        .onTapGesture {
                            withAnimation(.spring(response: 0.3)) {
                                if selectedMuscle == item.muscleGroup {
                                    selectedMuscle = nil
                                } else {
                                    selectedMuscle = item.muscleGroup
                                    HapticManager.selection()
                                }
                            }
                        }

                        if selectedMuscle == item.muscleGroup {
                            MuscleHistoryChart(
                                muscleGroup: item.muscleGroup,
                                sessions: sessions,
                                goals: goals,
                                showAbsolute: $showAbsolute
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

// MARK: - Week Header

struct WeekHeaderView: View {
    var pace: Double = 0

    var body: some View {
        let weekStart = Date().startOfWeek
        let weekEnd = Calendar.current.date(byAdding: .day, value: 6, to: weekStart) ?? Date()

        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text("Cette semaine")
                    .font(.subheadline.weight(.semibold))
                Text("\(weekStart.shortDate) — \(weekEnd.shortDate)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text("Jour \(Int(pace * 7))/7")
                .font(.caption2.weight(.medium).monospacedDigit())
                .foregroundStyle(.tertiary)
        }
    }
}

// MARK: - Muscle Group Card (with smart pacing from engine)

struct MuscleGroupCard: View {
    let progress: MuscleGroupProgress
    var weekPace: Double = 0
    var isSelected: Bool = false

    private var pace: PaceStatus {
        EffectiveSetsEngine.paceStatus(for: progress)
    }

    private var statusColor: Color {
        switch pace.color {
        case "green": return .green
        case "blue": return .blue
        case "orange": return .orange
        case "red": return .red
        default: return .secondary
        }
    }

    private var statusText: String {
        pace.frenchLabel
    }

    var body: some View {
        GlassCard(padding: 12, cornerRadius: 14) {
            VStack(spacing: 8) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            Text(progress.muscleGroup.displayName)
                                .font(.subheadline.weight(.semibold))
                            Image(systemName: isSelected ? "chevron.up" : "chevron.down")
                                .font(.system(size: 8))
                                .foregroundStyle(.tertiary)
                        }

                        HStack(spacing: 3) {
                            Text("\(Int(progress.effectiveSets))")
                                .font(.title3.weight(.bold).monospacedDigit())
                                .foregroundStyle(statusColor)
                            Text("/ \(Int(progress.goalSets))")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 2) {
                        // Pace status badge
                        Text(statusText)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(statusColor)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(statusColor.opacity(0.12), in: Capsule())

                        if progress.remaining > 0 {
                            Text("\(Int(ceil(progress.remaining))) left")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Progress bar with pace marker
                ZStack(alignment: .leading) {
                    ProgressBar(progress: progress.percentage, height: 5, accentColor: statusColor)

                    // Pace marker line
                    GeometryReader { geo in
                        Rectangle()
                            .fill(.white.opacity(0.3))
                            .frame(width: 1, height: 9)
                            .offset(x: geo.size.width * min(weekPace, 1), y: -2)
                    }
                    .frame(height: 5)
                }
            }
        }
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(statusColor.opacity(0.4), lineWidth: 1)
            }
        }
    }
}

// MARK: - History Chart

struct MuscleHistoryChart: View {
    let muscleGroup: MuscleGroup
    let sessions: [WorkoutSession]
    let goals: [MuscleGoal]
    @Binding var showAbsolute: Bool

    private var historyData: [WeeklyMuscleData] {
        EffectiveSetsEngine.weeklyHistory(sessions: sessions, goals: goals)
            .filter { $0.muscleGroup == muscleGroup }
    }

    private var goalValue: Double {
        goals.first(where: { $0.muscleGroup == muscleGroup })?.weeklyGoalSets ?? 0
    }

    var body: some View {
        GlassCard(padding: 12, cornerRadius: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Historique")
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Button {
                        showAbsolute.toggle()
                    } label: {
                        Text(showAbsolute ? "Sets" : "%")
                            .font(.caption2.weight(.medium))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }

                if historyData.isEmpty {
                    Text("Pas encore d'historique")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(height: 100)
                        .frame(maxWidth: .infinity)
                } else {
                    Chart {
                        ForEach(historyData) { data in
                            BarMark(
                                x: .value("Week", data.weekStart, unit: .weekOfYear),
                                y: .value(showAbsolute ? "Sets" : "%",
                                         showAbsolute ? data.effectiveSets : data.percentage)
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

                        if showAbsolute && goalValue > 0 {
                            RuleMark(y: .value("Goal", goalValue))
                                .foregroundStyle(.green.opacity(0.5))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        }

                        if !showAbsolute {
                            RuleMark(y: .value("100%", 100))
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
