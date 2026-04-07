import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var settingsArray: [UserSettings]
    @Query private var goals: [MuscleGoal]
    @Query(sort: \Exercise.name) private var exercises: [Exercise]

    private var settings: UserSettings {
        if let existing = settingsArray.first { return existing }
        let new = UserSettings()
        modelContext.insert(new)
        try? modelContext.save()
        return new
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Units") {
                    Toggle("Use Kilograms", isOn: Bindable(settings).usesKilograms)

                    HStack {
                        Text("Default Increment")
                        Spacer()
                        Text("\(settings.defaultSmallestIncrement.cleanWeight) \(settings.unitLabel)")
                            .foregroundStyle(.secondary)
                        Stepper("", value: Bindable(settings).defaultSmallestIncrement, in: 0.5...10, step: 0.5)
                            .labelsHidden()
                    }
                }

                Section("Rest Timer") {
                    Stepper("Default: \(settings.defaultRestTimerSeconds)s",
                            value: Bindable(settings).defaultRestTimerSeconds,
                            in: 30...600,
                            step: 15)
                }

                Section("Default Rep Target") {
                    Stepper("Min: \(settings.defaultRepTargetMin)",
                            value: Bindable(settings).defaultRepTargetMin,
                            in: 1...50)
                    Stepper("Max: \(settings.defaultRepTargetMax)",
                            value: Bindable(settings).defaultRepTargetMax,
                            in: 1...50)
                }

                Section("Weekly Set Goals") {
                    ForEach(MuscleGroup.allCases) { muscle in
                        MuscleGoalRow(muscle: muscle, goals: goals, modelContext: modelContext)
                    }
                }

                Section("Exercises") {
                    NavigationLink("Manage Exercises (\(exercises.count))") {
                        ExerciseManagementView()
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        try? modelContext.save()
                        dismiss()
                    }
                }
            }
        }
    }
}

struct MuscleGoalRow: View {
    let muscle: MuscleGroup
    let goals: [MuscleGoal]
    let modelContext: ModelContext

    private var goal: MuscleGoal {
        if let existing = goals.first(where: { $0.muscleGroup == muscle }) {
            return existing
        }
        let new = MuscleGoal(muscleGroup: muscle, weeklyGoalSets: 0)
        modelContext.insert(new)
        return new
    }

    var body: some View {
        HStack {
            Text(muscle.displayName)
                .font(.subheadline)
            Spacer()
            Text("\(goal.weeklyGoalSets, specifier: "%.0f") sets")
                .font(.caption)
                .foregroundStyle(.secondary)
            Stepper("", value: Bindable(goal).weeklyGoalSets, in: 0...40, step: 1)
                .labelsHidden()
        }
    }
}

struct ExerciseManagementView: View {
    @Query(sort: \Exercise.name) private var exercises: [Exercise]
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        List {
            ForEach(exercises) { exercise in
                NavigationLink {
                    ExerciseDetailView(exercise: exercise)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 4) {
                                Text(exercise.name)
                                    .font(.subheadline)
                                if exercise.isFavorite {
                                    Image(systemName: "star.fill")
                                        .font(.caption2)
                                        .foregroundStyle(.yellow)
                                }
                            }
                            Text(exercise.setPatternMode.displayName)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if let primary = exercise.primaryMuscle {
                            Text(primary.displayName)
                                .font(.caption2)
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
            }
            .onDelete { indexSet in
                for index in indexSet {
                    modelContext.delete(exercises[index])
                }
                try? modelContext.save()
            }
        }
        .navigationTitle("Exercises")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ExerciseDetailView: View {
    @Bindable var exercise: Exercise
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        Form {
            Section("Details") {
                TextField("Name", text: $exercise.name)
                Toggle("Favorite", isOn: $exercise.isFavorite)
                Picker("Pattern", selection: $exercise.setPatternMode) {
                    ForEach(SetPatternMode.allCases) { mode in
                        Text(mode.displayName).tag(mode)
                    }
                }
            }

            Section("Rep Target") {
                Stepper("Min: \(exercise.repTargetMin)", value: $exercise.repTargetMin, in: 1...50)
                Stepper("Max: \(exercise.repTargetMax)", value: $exercise.repTargetMax, in: 1...50)
                Stepper("Increment: \(exercise.smallestIncrement.cleanWeight)",
                        value: $exercise.smallestIncrement, in: 0.5...20, step: 0.5)
            }

            Section("Muscle Mappings") {
                ForEach(exercise.muscleMappings) { mapping in
                    HStack {
                        Text(mapping.muscleGroup.displayName)
                        Spacer()
                        Text("\(mapping.coefficient, specifier: "%.1f")")
                            .foregroundStyle(Color.accentColor)
                    }
                }

                Button("Add Muscle") {
                    let mapping = MuscleMapping(muscleGroup: .chest, coefficient: 0.3)
                    mapping.exercise = exercise
                    modelContext.insert(mapping)
                    exercise.muscleMappings.append(mapping)
                }
            }
        }
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
