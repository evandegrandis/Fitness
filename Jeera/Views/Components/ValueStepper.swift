import SwiftUI

struct ValueStepper: View {
    let label: String
    @Binding var value: Double
    var step: Double = 2.5
    var minValue: Double = 0
    var maxValue: Double = 500
    var format: String = "%.1f"
    var unit: String = "kg"

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 50, alignment: .leading)

            Button {
                let newVal = max(minValue, value - step)
                value = newVal
                HapticManager.tap()
            } label: {
                Image(systemName: "minus")
                    .font(.title3.weight(.semibold))
                    .frame(width: 44, height: 44)
                    .background(Color.white.opacity(0.12), in: Circle())
            }

            Text(value.cleanWeight)
                .font(.title2.weight(.bold).monospacedDigit())
                .frame(minWidth: 60)

            if !unit.isEmpty {
                Text(unit)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button {
                let newVal = min(maxValue, value + step)
                value = newVal
                HapticManager.tap()
            } label: {
                Image(systemName: "plus")
                    .font(.title3.weight(.semibold))
                    .frame(width: 44, height: 44)
                    .background(Color.white.opacity(0.12), in: Circle())
            }
        }
        .foregroundStyle(.primary)
    }
}

struct RepStepper: View {
    let label: String
    @Binding var value: Int
    var minValue: Int = 0
    var maxValue: Int = 100

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 50, alignment: .leading)

            Button {
                let newVal = max(minValue, value - 1)
                value = newVal
                HapticManager.tap()
            } label: {
                Image(systemName: "minus")
                    .font(.title3.weight(.semibold))
                    .frame(width: 44, height: 44)
                    .background(Color.white.opacity(0.12), in: Circle())
            }

            Text("\(value)")
                .font(.title2.weight(.bold).monospacedDigit())
                .frame(minWidth: 40)

            Text("reps")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                let newVal = min(maxValue, value + 1)
                value = newVal
                HapticManager.tap()
            } label: {
                Image(systemName: "plus")
                    .font(.title3.weight(.semibold))
                    .frame(width: 44, height: 44)
                    .background(Color.white.opacity(0.12), in: Circle())
            }
        }
        .foregroundStyle(.primary)
    }
}
