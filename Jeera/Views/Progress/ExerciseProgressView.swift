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

    private var usedExercises: [Exercise] {
        exercises.filter { ex in
            sessions.contains { session in
                session.loggedExercises.contains { $0.exercise?.id == ex.id }
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Exercise List
                ForEach(usedExercises) { exercise in
                    ExerciseProgressRow(
                        exercise: exercise,
                        sessions: sessions,
                        isSelected: selectedExercise?.id == exercise.id
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
                        Text("No exercise history yet")
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

struct ExerciseProgressRow: View {
    let exercise: Exercise
    let sessions: [WorkoutSession]
    var isSelected: Bool = false

    private var history: [(date: Date, bestWeight: Double, bestReps: Int)] {
        sessions.compactMap { session in
            guard let logged = session.loggedExercises.first(where: { $0.exercise?.id == exercise.id }) else {
                return nil
            }
            let workSets = logged.completedWorkSets
            guard !workSets.isEmpty else { return nil }

            let best = workSets.max(by: { $0.weight < $1.weight }) ?? workSets[0]
            return (date: session.date, bestWeight: best.weight, bestReps: best.reps)
        }
        .sorted { $0.date < $1.date }
    }

    var body: some View {
        GlassCard(padding: 14, cornerRadius: 16) {
            VStack(spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(exercise.name)
                            .font(.subheadline.weight(.semibold))

                        if let last = history.last {
                            HStack(spacing: 4) {
                                Text("Best:")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                if last.bestWeight > 0 {
                                    Text("\(last.bestWeight.cleanWeight)x\(last.bestReps)")
                                        .font(.caption.weight(.semibold).monospacedDigit())
                                        .foregroundStyle(Color.accentColor)
                                } else {
                                    Text("BWx\(last.bestReps)")
                                        .font(.caption.weight(.semibold).monospacedDigit())
                                        .foregroundStyle(Color.accentColor)
                                }
                            }
                        }
                    }

                    Spacer()

                    Text("\(history.count) sessions")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)

                    Image(systemName: isSelected ? "chevron.up" : "chevron.down")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                if isSelected && history.count >= 2 {
                    Divider().background(.white.opacity(0.1))

                    Chart {
                        ForEach(history, id: \.date) { entry in
                            if entry.bestWeight > 0 {
                                LineMark(
                                    x: .value("Date", entry.date),
                                    y: .value("Weight", entry.bestWeight)
                                )
                                .foregroundStyle(ColorColor.accentColor)
                                .lineStyle(StrokeStyle(lineWidth: 2))
                                .interpolationMethod(.catmullRom)

                                PointMark(
                                    x: .value("Date", entry.date),
                                    y: .value("Weight", entry.bestWeight)
                                )
                                .foregroundStyle(ColorColor.accentColor)
                                .symbolSize(20)
                            } else {
                                LineMark(
                                    x: .value("Date", entry.date),
                                    y: .value("Reps", entry.bestReps)
                                )
                                .foregroundStyle(ColorColor.accentColor)
                                .lineStyle(StrokeStyle(lineWidth: 2))
                                .interpolationMethod(.catmullRom)

                                PointMark(
                                    x: .value("Date", entry.date),
                                    y: .value("Reps", entry.bestReps)
                                )
                                .foregroundStyle(ColorColor.accentColor)
                                .symbolSize(20)
                            }
                        }
                    }
                    .frame(height: 140)
                    .chartXAxis {
                        AxisMarks { value in
                            AxisValueLabel {
                                if let date = value.as(Date.self) {
                                    Text(date.shortDate)
                                        .font(.caption2)
                                }
                            }
                        }
                    }
                    .chartYAxis {
                        AxisMarks { _ in
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
