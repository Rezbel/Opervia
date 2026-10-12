using Opervia.Application.Reporting;
namespace Opervia.Application.Tests.Reporting;
public sealed class FilterSelectionTests
{
    [Fact] public void AcceptsSingleAndMultipleExactCodes() {
        Assert.Equal(new[]{"7"}, FilterSelection.Values(" 7 "));
        Assert.Equal(new[]{"7","17"},FilterSelection.Values("[\"7\",\"17\",\"7\"]"));
        Assert.True(FilterSelection.Matches("[\"7\",\"18\"]", "18"));
        Assert.False(FilterSelection.Matches("[\"7\",\"18\"]", "17"));
    }
    [Fact] public void EmptySelectionIncludesAllAndLabelsPreservePunctuation() {
        Assert.True(FilterSelection.Matches(null,"7"));
        Assert.True(FilterSelection.Matches("[]","7"));
        Assert.Equal(new[]{"Marca, S.A.","Otra"}, FilterSelection.Values("[\"Marca, S.A.\",\"Otra\"]"));
        Assert.False(FilterSelection.Matches("[invalid","7"));
    }
}
