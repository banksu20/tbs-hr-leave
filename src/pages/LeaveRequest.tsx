import LeaveRequestForm from "@/components/LeaveRequestForm";

interface LeaveRequestProps {
  userId?: string;
  userName?: string;
  initialLeaveType?: string;
  department?: string;
}

const LeaveRequest = ({ userId, userName, department, initialLeaveType }: LeaveRequestProps) => {
  return (
    <LeaveRequestForm 
      userId={userId} 
      userName={userName} 
      initialLeaveType={initialLeaveType} 
      department={department}
    />
  );
};

export default LeaveRequest;