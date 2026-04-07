import SwiftUI
import SwiftData

struct ExercisePickerView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Exercise.name) private var allExercises: [Exercise]
    @State private var searchText = ""
    @State private var showCreateExercise = false

    let onSelect: (Exercise) -> Void

    private var filteredExercises: [Exercise] {
        if searchText.isEmpty {
            return sortedExercises
        }
        return sortedExercises.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var sortedExercises: [Exercise] {
        allExercises.sorted { a, b in
            if a.isFavorite != b.isFavorite { return a.isFavorite }
            if let aDate = a.lastUsed, let bDate = b.lastUsed {
                return aDate > bDate
            }
            if a.lastUsed != nil { return true }
            if b.lastUsed != nil { return false }
            return a.name < b.name
        }
    }

    private var groupedExercises: [(String, [Exercise])] {
        let grouped = Dictionary(grouping: filteredExercises) { exercise -> String in
            if exercise.isFavorite { return "Favorites" }
            if exercise.lastUsed != nil { return "Recent" }
            return exercise.category.isEmpty ? "Other" : exercise.category
        }
        let order = ["Favorites", "Recent", "Push", "Pull", "Legs", "Core", "Arms", "Other"]
        return order.compactMap { key in
            guard let exercises = grouped[key], !exercises.isEmpty else { return nil }
            return (key, exercises)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundGradient()

                ScrollView {
                    LazyVStack(spacing: 4, pinnedViews: .sectionHeaders) {
                        ForEach(groupedExercises, id: \.0) { section, exercises in
                            Section {
                                ForEach(exercises) { exercise in
                                    ExercisePickerRow(exercise: exercise) {
                                        onSelect(exercise)
                                        dismiss()
                                    }
                                }
                            } header: {
                                Text(section)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 6)
                                    .background(.ultraThinMaterial)
                            }
                        }
                    }
                    .padding(.top, 8)
                }
                .searchable(text: $searchText, prompt: "Search exercises")
            }
            .navigationTitle("Add Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateExercise = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showCreateExercise) {
                CreateExerciseView { exercise in
                    onSelect(exercise)
                    dismiss()
                }
            }
        }
    }
}

struct ExercisePickerRow: View {
    let exercise: Exercise
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(exercise.name)
                            .font(.subheadline.weight(.medium))
                        if exercise.isFavorite {
                            Image(systemName: "star.fill")
                                .font(.caption2)
                                .foregroundStyle(.yellow)
                        }
                    }
                    HStack(spacing: 8) {
                        Text(exercise.setPatternMode.shortName)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        if let primary = exercise.primaryMuscle {
                            Text(primary.displayName)
                                .font(.caption2)
                                .foregroundStyle(Color.accentColor.opacity(0.8))
                        }
                    }
                }
                Spacer()
                Image(systemName: "plus.circle")
                    .font(.body)
                    .foregroundStyle(Color.accentColor)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
    }
}

struct CreateExerciseView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var category = "Push"
    @State private var setPatternMode: SetPatternMode = .straight
    @State private var repMin = 8
    @State private var repMax = 12
    @State private var increment = 2.5
    @State private var selectedMuscles: [MuscleGroup: Double] = [:]

    let categories = ["Push", "Pull", "Legs", "Core", "Arms", "Other"]
    let onCreated: (Exercise) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Exercise") {
                    TextField("Name", text: $name)
                    Picker("Category", selection: $category) {
                        ForEach(categories, id: \.self) { Text($0) }
                    }
                    Picker("Pattern", selection: $setPatternMode) {
                        ForEach(SetPatternMode.allCases) { mode in
                            Text(mode.displayName).tag(mode)
                        }
                    }
                }

                Section("Rep Target") {
                    Stepper("Min: \(repMin)", value: $repMin, in: 1...50)
                    Stepper("Max: \(repMax)", value: $repMax, in: 1...50)
                    Stepper("Increment: \(increment.cleanWeight) kg", value: $increment, in: 0.5...10, step: 0.5)
                }

                Section("Muscles") {
                    ForEach(MuscleGroup.allCases) { muscle in
                        HStack {
                            Text(muscle.displayName)
                            Spacer()
                            Menu {
                                Button("Primary (1.0)") { selectedMuscles[muscle] = 1.0 }
                                Button("Strong Secondary (0.3)") { selectedMuscles[muscle] = 0.3 }
                                Button("Light Secondary (0.1)") { selectedMuscles[muscle] = 0.1 }
                                Button("None") { selectedMuscles.removeValue(forKey: muscle) }
                            } label: {
                                if let coeff = selectedMuscles[muscle] {
                                    Text("\(coeff, specifier: "%.1f")")
                                        .foregroundStyle(Color.accentColor)
                                } else {
                                    Text("--")
                                        .foregroundStyle(.tertiary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("New Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Create") {
                        createExercise()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }

    private func createExercise() {
        let exercise = Exercise(
            name: name,
            category: category,
            setPatternMode: setPatternMode,
            repTargetMin: repMin,
            repTargetMax: repMax,
            smallestIncrement: increment,
            createdByUser: true
        )
        modelContext.insert(exercise)

        for (muscle, coeff) in selectedMuscles {
            let mapping = MuscleMapping(muscleGroup: muscle, coefficient: coeff)
            mapping.exercise = exercise
            modelContext.insert(mapping)
            exercise.muscleMappings.append(mapping)
        }

        try? modelContext.save()
        onCreated(exercise)
        dismiss()
    }
}
