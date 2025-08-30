import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, DropResult } from 'react-beautiful-dnd';
import { 
  ShoppingCart, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Printer, 
  Clock, 
  Package, 
  TrendingUp, 
  AlertTriangle,
  BarChart3,
  Users,
  Calendar,
  DollarSign,
  Loader2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { OrderForm } from '../components/OrderForm';
import { OrderItemsTable } from '../components/OrderItemsTable';
import { OrderStatusTimeline } from '../components/OrderStatusTimeline';
import { ProductionTracker } from '../components/ProductionTracker';
import { ShipmentTracker } from '../components/ShipmentTracker';
import { PrintableOrder } from '../components/PrintableOrder';
import { SaveRecipeDialog } from '../components/SaveRecipeDialog';
import { ViewRecipesDialog } from '../components/ViewRecipesDialog';
import { AlertDialog } from '../components/AlertDialog';
import { SaveOptionsDialog } from '../components/SaveOptionsDialog';
import { PasswordInputDialog } from '../components/PasswordInputDialog';
import { useToast } from '../components/ui/ToastProvider';
import { useReactToPrint } from 'react-to-print';
import { Order, OrderItem, initialOrderData, generateOrderNumber, ORDER_STATUSES, PRIORITY_LEVELS } from '../types/order';
import type { Recipe } from '../types';
import { db } from '../lib/firebaseConfig';
import { collection, addDoc, updateDoc, doc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import * as Select from '@radix-ui/react-select';

interface OrderManagementProps {
  user: any; // Firebase User object
}

export function OrderManagement({ user }: OrderManagementProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new-order' | 'orders'>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  
  // Form and dialog states
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isSaveOptionsOpen, setIsSaveOptionsOpen] = useState(false);
  const [isViewOrdersOpen, setIsViewOrdersOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Delete functionality states
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [isPasswordInputOpen, setIsPasswordInputOpen] = useState(false);
  const [isAuthenticatingPassword, setIsAuthenticatingPassword] = useState(false);
  const [passwordAuthError, setPasswordAuthError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  
  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    isAuthenticating?: boolean;
  } | null>(null);

  const { showToast } = useToast();

  const [orderData, setOrderData] = useState<Order>({
    ...initialOrderData,
    id: '',
    orderNumber: generateOrderNumber(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: user?.uid || '',
  });

  // Fetch user-specific orders from Firebase
  useEffect(() => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ordersCollectionRef = collection(db, "users", user.uid, "orders");
    const q = query(ordersCollectionRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders: Order[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(fetchedOrders);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching orders:", error);
      showToast({
        message: "Error fetching orders from cloud. Please try again.",
        type: 'error',
      });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, showToast]);

  // Calculate totals when items change
  useEffect(() => {
    const subtotal = orderData.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const totalAmount = subtotal - orderData.discount + orderData.tax + orderData.shippingCost;
    
    setOrderData(prev => ({
      ...prev,
      subtotal,
      totalAmount,
    }));
  }, [orderData.items, orderData.discount, orderData.tax, orderData.shippingCost]);

  // Track form changes
  useEffect(() => {
    if (loadedOrderId) {
      setHasUnsavedChanges(true);
    }
  }, [orderData, loadedOrderId]);

  const handleItemsChange = useCallback((newItems: OrderItem[]) => {
    setOrderData(prev => ({ ...prev, items: newItems }));
    if (loadedOrderId) {
      setHasUnsavedChanges(true);
    }
  }, [loadedOrderId]);

  const handleReorderItems = useCallback((startIndex: number, endIndex: number) => {
    setOrderData(prev => {
      const result = Array.from(prev.items);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return { ...prev, items: result };
    });
  }, []);

  const handleOnDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    handleReorderItems(result.source.index, result.destination.index);
  };

  // Print functionality
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Order_${orderData.orderNumber}`,
    onAfterPrint: () => {
      console.log('Print completed.');
    },
  });

  const handlePrintOrder = (order?: Order) => {
    if (order) {
      // Print specific order from history
      const currentOrderData = orderData;
      setOrderData(order);
      setTimeout(() => {
        handlePrint();
        setOrderData(currentOrderData);
      }, 100);
    } else {
      // Print current order
      handlePrint();
    }
  };

  // Edit functionality
  const handleEditOrder = (order: Order) => {
    setOrderData(order);
    setLoadedOrderId(order.id);
    setHasUnsavedChanges(false);
    setActiveTab('new-order');
    showToast({
      message: `Order "${order.orderNumber}" loaded for editing!`,
      type: 'info',
    });
  };

  // Delete functionality
  const handleDeleteOrder = (orderId: string, orderNumber: string) => {
    if (!user || !user.email) {
      setAlertDialog({
        isOpen: true,
        title: "Authentication Required",
        message: "Please log in with an email and password to delete orders.",
        type: 'warning',
      });
      return;
    }
    setDeleteConfirm({ id: orderId, name: orderNumber });
    setIsPasswordInputOpen(true);
    setPasswordAuthError(null);
  };

  const handlePasswordAuthorization = async (password: string) => {
    if (!user || !user.email || !deleteConfirm) {
      console.error("Missing user, email, or order to delete:", { user: !!user, email: user?.email, deleteConfirm });
      return;
    }

    setIsAuthenticatingPassword(true);
    setPasswordAuthError(null);

    try {
      console.log("Attempting to reauthenticate user:", user.uid);
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      console.log("Reauthentication successful");
      
      setIsPasswordInputOpen(false);
      setAlertDialog({
        isOpen: true,
        title: "Confirm Deletion",
        message: `Password authorized. Are you sure you want to delete order "${deleteConfirm.name}"? This action cannot be undone.`,
        type: 'confirm',
        onConfirm: async () => {
          setIsConfirmingDelete(true);
          try {
            console.log("Attempting to delete order:", deleteConfirm.id, "for user:", user.uid);
            
            await deleteDoc(doc(db, "users", user.uid, "orders", deleteConfirm.id));
            
            showToast({
              message: `Order "${deleteConfirm.name}" deleted successfully!`,
              type: 'success',
            });
            
            setDeleteConfirm(null);
            setAlertDialog(null);
          } catch (error) {
            console.error("Failed to delete order:", error);
            showToast({
              message: `Error deleting order: ${error instanceof Error ? error.message : 'Unknown error'}`,
              type: 'error',
            });
          } finally {
            setIsConfirmingDelete(false);
          }
        },
        onCancel: () => {
          setAlertDialog(null);
          setDeleteConfirm(null);
        },
        confirmText: "Delete",
        cancelText: "Cancel",
        isAuthenticating: isConfirmingDelete,
      });

    } catch (error: any) {
      console.error("Password reauthentication failed:", error);
      let errorMessage = "Password authorization failed. Please try again.";
      if (error.code === 'auth/wrong-password') {
        errorMessage = "Incorrect password. Please try again.";
      } else if (error.code === 'auth/user-mismatch') {
        errorMessage = "User mismatch. Please log in again.";
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = "Invalid credentials. Please check your email and password.";
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = "This action requires a recent login. Please log in again.";
      }
      setPasswordAuthError(errorMessage);
    } finally {
      setIsAuthenticatingPassword(false);
    }
  };

  // Save functionality
  const handleSaveOrder = async (orderName: string) => {
    if (!user) {
      setAlertDialog({
        isOpen: true,
        title: "Authentication Required",
        message: "Please ensure you are authenticated to save orders.",
        type: 'warning',
      });
      return;
    }

    setIsSaving(true);

    const orderDataToSave = {
      ...orderData,
      customerName: orderName,
      updatedAt: new Date().toISOString(),
      userId: user.uid,
    };

    try {
      if (loadedOrderId) {
        // Update existing order
        await updateDoc(doc(db, "users", user.uid, "orders", loadedOrderId), orderDataToSave);
        showToast({
          message: `Order "${orderName}" updated successfully!`,
          type: 'success',
        });
      } else {
        // Create new order
        const docRef = await addDoc(collection(db, "users", user.uid, "orders"), {
          ...orderDataToSave,
          createdAt: new Date().toISOString(),
        });
        setLoadedOrderId(docRef.id);
        showToast({
          message: `Order "${orderName}" saved successfully!`,
          type: 'success',
        });
      }
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to save order:", error);
      showToast({
        message: "Error saving order. Check console for details.",
        type: 'error',
      });
    } finally {
      setIsSaving(false);
      setIsSaveDialogOpen(false);
    }
  };

  const handleClear = () => {
    setOrderData({
      ...initialOrderData,
      id: '',
      orderNumber: generateOrderNumber(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: user?.uid || '',
    });
    setLoadedOrderId(null);
    setHasUnsavedChanges(false);
  };

  // Filter orders
  const filteredOrders = orders.filter(order => {
    const matchesSearch = searchTerm === '' || 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerCompany.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Calculate dashboard statistics
  const stats = {
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => ['received', 'confirmed', 'in-production'].includes(o.status)).length,
    completedOrders: orders.filter(o => o.status === 'delivered').length,
    totalRevenue: orders.reduce((sum, order) => sum + order.totalAmount, 0),
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).toUpperCase();
  };

  const getStatusLabel = (status: string) => {
    return ORDER_STATUSES.find(s => s.value === status)?.label || status;
  };

  const getPriorityLabel = (priority: string) => {
    return PRIORITY_LEVELS.find(p => p.value === priority)?.label || priority;
  };

  const StatCard = ({ icon: Icon, label, value, color }: { icon: React.ElementType, label: string, value: string | number, color: string }) => (
    <motion.div
      className="bg-card p-6 rounded-lg border border-border shadow-sm"
      whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card text-card-foreground border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Order Management</h1>
              <p className="text-muted-foreground mt-1">Complete order lifecycle management from receipt to delivery</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setActiveTab('new-order')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                New Order
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit mt-4">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                activeTab === 'dashboard'
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('new-order')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                activeTab === 'new-order'
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              {loadedOrderId ? 'Edit Order' : 'New Order'}
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                activeTab === 'orders'
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Clock className="h-4 w-4" />
              Orders ({orders.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                  icon={ShoppingCart}
                  label="Total Orders"
                  value={stats.totalOrders}
                  color="bg-blue-500"
                />
                <StatCard
                  icon={Clock}
                  label="Pending Orders"
                  value={stats.pendingOrders}
                  color="bg-orange-500"
                />
                <StatCard
                  icon={Package}
                  label="Completed Orders"
                  value={stats.completedOrders}
                  color="bg-green-500"
                />
                <StatCard
                  icon={DollarSign}
                  label="Total Revenue"
                  value={`₹${stats.totalRevenue.toFixed(2)}`}
                  color="bg-purple-500"
                />
              </div>

              {/* Recent Orders */}
              <div className="bg-card rounded-lg shadow-sm border border-border p-6">
                <h2 className="text-xl font-bold text-foreground mb-4">Recent Orders</h2>
                {orders.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-lg font-medium">No orders yet</p>
                    <p className="text-muted-foreground text-sm mt-1">Create your first order to get started</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.slice(0, 5).map((order) => (
                      <div key={order.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <ShoppingCart className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{order.orderNumber}</p>
                            <p className="text-sm text-muted-foreground">{order.customerName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-foreground">₹{order.totalAmount.toFixed(2)}</p>
                          <p className="text-sm text-muted-foreground">{formatDate(order.orderDate)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'new-order' && (
            <motion.div
              key="new-order"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-card text-card-foreground rounded-lg shadow-sm p-6 border border-border">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">
                      {loadedOrderId ? 'Edit Order' : 'Create New Order'}
                    </h2>
                    <p className="text-muted-foreground">
                      {loadedOrderId ? 'Modify order details and track production progress' : 'Enter order details and manage the complete production lifecycle'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-6">
                    <span className="text-sm font-medium text-muted-foreground">Order No:</span>
                    <span className="ml-2 text-lg font-mono font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {orderData.orderNumber}
                    </span>
                  </div>
                </div>

                <OrderForm data={orderData} onChange={setOrderData} />

                <DragDropContext onDragEnd={handleOnDragEnd}>
                  <OrderItemsTable
                    items={orderData.items}
                    onItemsChange={handleItemsChange}
                  />
                </DragDropContext>

                <div className="mt-8 flex flex-wrap justify-end gap-3">
                  <Button variant="outline" onClick={handleClear}>Clear Form</Button>
                  <Button 
                    onClick={() => setIsSaveDialogOpen(true)} 
                    className="bg-[#1A3636] hover:bg-green-900 text-white"
                  >
                    {loadedOrderId && hasUnsavedChanges ? 'Save Changes' : 'Save Order'}
                  </Button>
                  <Button 
                    onClick={() => handlePrintOrder()} 
                    className="bg-[#FF9900] hover:bg-orange-500 text-white flex items-center"
                  >
                    <Printer className="h-5 w-5 mr-2" />
                    Print Order
                  </Button>
                </div>
              </div>

              {/* Order Status Timeline */}
              {loadedOrderId && (
                <OrderStatusTimeline order={orderData} />
              )}

              {/* Production Tracking */}
              {loadedOrderId && (
                <ProductionTracker
                  stages={orderData.productionStages}
                  qualityChecks={orderData.qualityChecks}
                  onStagesChange={(stages) => setOrderData(prev => ({ ...prev, productionStages: stages }))}
                  onQualityChecksChange={(checks) => setOrderData(prev => ({ ...prev, qualityChecks: checks }))}
                />
              )}

              {/* Shipment Tracking */}
              {loadedOrderId && (
                <ShipmentTracker
                  shipmentDetails={orderData.shipmentDetails}
                  onShipmentChange={(details) => setOrderData(prev => ({ ...prev, shipmentDetails: details }))}
                />
              )}
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-card text-card-foreground rounded-lg shadow-sm border border-border"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-foreground">Order History & Management</h2>
                  <div className="flex gap-4">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        type="text"
                        placeholder="Search orders, customers, companies..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 w-80"
                      />
                    </div>
                    
                    {/* Status Filter */}
                    <Select.Root value={statusFilter} onValueChange={setStatusFilter}>
                      <Select.Trigger className="flex items-center justify-between w-48 rounded-md border border-border shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground py-2 px-3">
                        <Select.Value placeholder="All Statuses" />
                        <Select.Icon>
                          <Filter className="h-4 w-4" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="overflow-hidden rounded-lg bg-card border border-border shadow-lg z-50">
                          <Select.Viewport className="p-1">
                            <Select.Item value="all" className="relative flex items-center rounded-md py-2 pl-3 pr-9 text-foreground text-sm outline-none data-[highlighted]:bg-primary/20">
                              <Select.ItemText>All Statuses</Select.ItemText>
                            </Select.Item>
                            {ORDER_STATUSES.map(status => (
                              <Select.Item key={status.value} value={status.value} className="relative flex items-center rounded-md py-2 pl-3 pr-9 text-foreground text-sm outline-none data-[highlighted]:bg-primary/20">
                                <Select.ItemText>{status.label}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>

                    {/* Priority Filter */}
                    <Select.Root value={priorityFilter} onValueChange={setPriorityFilter}>
                      <Select.Trigger className="flex items-center justify-between w-48 rounded-md border border-border shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground py-2 px-3">
                        <Select.Value placeholder="All Priorities" />
                        <Select.Icon>
                          <Filter className="h-4 w-4" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="overflow-hidden rounded-lg bg-card border border-border shadow-lg z-50">
                          <Select.Viewport className="p-1">
                            <Select.Item value="all" className="relative flex items-center rounded-md py-2 pl-3 pr-9 text-foreground text-sm outline-none data-[highlighted]:bg-primary/20">
                              <Select.ItemText>All Priorities</Select.ItemText>
                            </Select.Item>
                            {PRIORITY_LEVELS.map(priority => (
                              <Select.Item key={priority.value} value={priority.value} className="relative flex items-center rounded-md py-2 pl-3 pr-9 text-foreground text-sm outline-none data-[highlighted]:bg-primary/20">
                                <Select.ItemText>{priority.label}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                </div>

                {/* Orders List */}
                <div className="space-y-4">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                      <p className="text-lg font-medium">Loading orders...</p>
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-12">
                      <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground text-lg font-medium">
                        {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all' ? 'No orders found' : 'No orders yet'}
                      </p>
                      <p className="text-muted-foreground text-sm mt-1">
                        {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all' 
                          ? 'Try adjusting your search or filters' 
                          : 'Create your first order to get started'
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {filteredOrders.map((order) => (
                        <motion.div
                          key={order.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300"
                        >
                          {/* Order Header */}
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="p-3 bg-primary/10 rounded-lg">
                                <ShoppingCart className="h-6 w-6 text-primary" />
                              </div>
                              <div>
                                <h3 className="font-bold text-lg text-foreground">{order.orderNumber}</h3>
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(order.orderDate)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                PRIORITY_LEVELS.find(p => p.value === order.priority)?.color || 'bg-gray-100 text-gray-800'
                              }`}>
                                {getPriorityLabel(order.priority)}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                ORDER_STATUSES.find(s => s.value === order.status)?.color || 'bg-gray-100 text-gray-800'
                              }`}>
                                {getStatusLabel(order.status)}
                              </span>
                            </div>
                          </div>

                          {/* Customer Info */}
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium text-foreground">{order.customerName}</span>
                            </div>
                            <p className="text-sm text-muted-foreground ml-6">{order.customerCompany}</p>
                          </div>

                          {/* Order Summary */}
                          <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-muted/30 rounded-lg">
                            <div>
                              <p className="text-xs text-muted-foreground">Items</p>
                              <p className="font-medium text-foreground">{order.items.length}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Delivery</p>
                              <p className="font-medium text-foreground">
                                {order.deliveryDate ? formatDate(order.deliveryDate) : 'TBD'}
                              </p>
                            </div>
                          </div>

                          {/* Total Amount */}
                          <div className="flex justify-between items-center mb-4 p-3 bg-accent/20 rounded-lg">
                            <span className="font-medium text-foreground">Total Amount</span>
                            <span className="text-xl font-bold text-foreground">₹{order.totalAmount.toFixed(2)}</span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex justify-between items-center">
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditOrder(order)}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePrintOrder(order)}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <Printer className="h-4 w-4 mr-1" />
                                Print
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteOrder(order.id, order.orderNumber)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hidden Print Component */}
      <div style={{ display: 'none' }}>
        <PrintableOrder ref={printRef} data={orderData} />
      </div>

      {/* Dialogs */}
      <SaveRecipeDialog
        isOpen={isSaveDialogOpen}
        onClose={() => setIsSaveDialogOpen(false)}
        onSave={handleSaveOrder}
        isSaving={isSaving}
      />

      {alertDialog && (
        <AlertDialog
          isOpen={alertDialog.isOpen}
          onClose={() => setAlertDialog(null)}
          title={alertDialog.title}
          message={alertDialog.message}
          type={alertDialog.type}
          onConfirm={alertDialog.onConfirm}
          onCancel={alertDialog.onCancel}
          confirmText={alertDialog.confirmText}
          cancelText={alertDialog.cancelText}
          isAuthenticating={alertDialog.isAuthenticating}
        />
      )}

      {isPasswordInputOpen && (
        <PasswordInputDialog
          isOpen={isPasswordInputOpen}
          onClose={() => {
            setIsPasswordInputOpen(false);
            setDeleteConfirm(null);
            setPasswordAuthError(null);
          }}
          onConfirm={handlePasswordAuthorization}
          title="Authorize Deletion"
          message="Please enter your password to authorize the deletion of this order."
          isAuthenticating={isAuthenticatingPassword}
          error={passwordAuthError}
        />
      )}
    </div>
  );
}