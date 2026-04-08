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
            .sorted { $0.percentage > $1.percentage }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Week Header
                WeekHeaderView()
                    .padding(.horizontal)

                // Muscle Cards
                ForEach(progress) { item in
                    MuscleGroupCard(
                        progress: item,
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
                    .padding(.horizontal)
                }

                // Historical Chart for selected muscle
                if let selected = selectedMuscle {
                    MuscleHistoryChart(
                        muscleGroup: selected,
                        sessions: sessions,
                        goals: goals,
                        showAbsolute: $showAbsolute
                    )
                    .padding(.horizontal)
                    .transition(.scale(scale: 0.95).combined(with: .opacity))
                }

                if progress.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "chart.bar.doc.horizontal")
                            .font(.largeTitle)
                            .foregroundStyle(.tertiary)
                        Text("No data yet")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("Complete workouts to see your muscle group progress.")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 60)
                }

                Spacer(minLength: 80)
            }
            .padding(.top, 12)
        }
    }
}

struct WeekHeaderView: View {
    var body: some View {
        let weekStart = Date().startOfWeek
        let weekEnd = Calendar.current.date(byAdding: .day, value: 6, to: weekStart) ?? Date()

        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("This Week")
                    .font(.headline)
                Text("\(weekStart.shortDate) - \(weekEnd.shortDate)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }
}

struct MuscleGroupCard: View {
    let progress: MuscleGroupProgress
    var isSelected: Bool = false

    private var progressColor: Color {
        if progress.percentage >= 100 { return .green }
        if progress.percentage >= 70 { return Color.accentColor }
        if progress.percentage >= 40 { return .orange }
        return .red
    }

    var body: some View {
        GlassCard(padding: 14, cornerRadius: 16) {
            VStack(spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(progress.muscleGroup.displayName)
                            .font(.subheadline.weight(.semibold))

                        HStack(spacing: 4) {
                            Text("\(progress.effectiveSets, specifier: "%.1f")")
                                .font(.title2.weight(.bold).monospacedDigit())
                                .foregroundStyle(progressColor)

                            Text("/ \(progress.goalSets, specifier: "%.0f")")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            Text("sets")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 3) {
                        Text("\(progress.percentage, specifier: "%.0f")%")
                            .font(.title3.weight(.bold).monospacedDigit())
                            .foregroundStyle(progressColor)

                        if progress.remaining > 0 {
                            Text("\(progress.remaining, specifier: "%.1f") left")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("Complete")
                                .font(.caption2)
                                .foregroundStyle(.green)
                        }

                        // Delta vs previous week
                        if progress.delta != 0 {
                            HStack(spacing: 2) {
                                Image(systemName: progress.delta > 0 ? "arrow.up.right" : "arrow.down.right")
                                    .font(.caption2)
                                Text("\(abs(progress.delta), specifier: "%.1f")")
                                    .font(.caption2.monospacedDigit())
                            }
                            .foregroundStyle(progress.delta > 0 ? .green : .orange)
                        }
                    }
                }

                ProgressBar(progress: progress.percentage, height: 6, accentColor: progressColor)
            }
        }
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(progressColor.opacity(0.5), lineWidth: 1.5)
            }
        }
    }
}

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
        GlassCard(cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("\(muscleGroup.displayName) History")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Button {
                        showAbsolute.toggle()
                    } label: {
                        Text(showAbsolute ? "Sets" : "%")
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }

                if historyData.isEmpty {
                    Text("No history yet")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(height: 150)
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
                                    colors: [Color.accentColor, Color.accentColor.opacity(0.5)],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                            .cornerRadius(4)
                        }

                        if showAbsolute && goalValue > 0 {
                            RuleMark(y: .value("Goal", goalValue))
                                .foregroundStyle(.green.opacity(0.6))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                                .annotation(position: .trailing, alignment: .leading) {
                                    Text("Goal")
                                        .font(.caption2)
                                        .foregroundStyle(.green)
                                }
                        }

                        if !showAbsolute {
                            RuleMark(y: .value("100%", 100))
                                .foregroundStyle(.green.opacity(0.6))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        }
                    }
                    .frame(height: 180)
                    .chartXAxis {
                        AxisMarks(values: .stride(by: .weekOfYear)) { value in
                            AxisValueLabel {
                                if let date = value.as(Date.self) {
                                    Text(date.weekLabel)
                                        .font(.caption2)
                                }
                            }
                        }
                    }
                    .chartYAxis {
                        AxisMarks { value in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.3))
                                .foregroundStyle(.white.opacity(0.1))
                            AxisValueLabel()
                                .font(.caption2)
                        }
                    }
                }
            }
        }
    }
}
