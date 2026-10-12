using Opervia.Application.Access;

namespace Opervia.Application.Tests.Access;

public sealed class SellerAccessScopeTests
{
    [Fact]
    public void AccountWithoutAssignedSellersCannotReadAnything()
    {
        SellerAccessScope.Sellers = [];
        try { Assert.False(SellerAccessScope.Allows("7")); Assert.Equal("1 = 0", SellerAccessScope.Sql("F.CVE_VEND")); }
        finally { SellerAccessScope.Sellers = null; }
    }
    [Fact]
    public void SellerAuthorizationUsesExactCodesRatherThanPrefixes()
    {
        SellerAccessScope.Sellers = ["1", "7"];
        try { Assert.True(SellerAccessScope.Allows(" 7 ")); Assert.False(SellerAccessScope.Allows("17")); Assert.False(SellerAccessScope.Allows("18")); Assert.False(SellerAccessScope.Allows(null)); }
        finally { SellerAccessScope.Sellers = null; }
    }
    [Fact]
    public async Task ConcurrentAccountsKeepIndependentSellerScopes()
    {
        SellerAccessScope.Sellers = null;
        var barrier = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var started = 0;
        async Task Check(string own, string other) {
            SellerAccessScope.Sellers = [own];
            if (Interlocked.Increment(ref started) == 2) barrier.SetResult();
            await barrier.Task;
            Assert.True(SellerAccessScope.Allows(own)); Assert.False(SellerAccessScope.Allows(other));
            Assert.DoesNotContain($"'{other}'", SellerAccessScope.Sql("F.CVE_VEND"));
        }
        await Task.WhenAll(Check("7", "18"), Check("18", "7"));
        Assert.Null(SellerAccessScope.Sellers);
    }
}
