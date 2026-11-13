import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Duty = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>당직 관리</CardTitle>
            <CardDescription>당직 관리 기능이 준비 중입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>당직 관리 기능을 개발 중입니다.</p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Duty;